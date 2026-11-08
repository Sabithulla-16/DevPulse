import * as http from 'node:http';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import type { ApiIntelligenceRepository } from '../../database/repositories/ApiIntelligenceRepository';
import type { ApiRequestEventItem, DevPulseSettings } from '../../shared/types';

export interface IngestionServerStatus {
  running: boolean;
  host: string;
  port: number;
  activeConnections: number;
  queueSize: number;
  error?: string;
}

export class ApiIngestionServer {
  private server: http.Server | null = null;
  private readonly sockets = new Set<net.Socket>();
  private readonly queue: ApiRequestEventItem[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private tokenCache = new Map<string, string>(); // tokenHash -> serviceId
  private activePort = 49152;
  private isRunning = false;
  private lastError: string | undefined;

  // Rate limiting: sliding 1-second counter
  private rateCount = 0;
  private rateWindowStart = Date.now();

  constructor(
    private readonly repository: ApiIntelligenceRepository,
    private settings: DevPulseSettings
  ) {
    this.activePort = settings.apiIngestionPort || 49152;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.refreshTokenCache();

    const host = this.settings.apiIngestionHost || '127.0.0.1';
    const targetPort = this.settings.apiIngestionPort || 49152;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.on('connection', socket => {
      this.sockets.add(socket);
      socket.once('close', () => {
        this.sockets.delete(socket);
      });
    });

    this.server.on('error', (err: any) => {
      console.warn('[DevPulse ApiIngestionServer] Server error:', err.message);
      this.lastError = err.message;
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();

      const onError = (err: any) => {
        this.lastError = err.message;
        if (err.code === 'EADDRINUSE') {
          console.warn(`[DevPulse ApiIngestionServer] Port ${targetPort} is occupied.`);
          this.isRunning = false;
        }
        resolve(); // Don't throw so extension continues
      };

      this.server.once('error', onError);

      this.server.listen(targetPort, host, () => {
        this.server?.removeListener('error', onError);
        this.activePort = targetPort;
        this.isRunning = true;
        this.lastError = undefined;
        resolve();
      });
    });

    // Start batch queue flush timer (every 2,000ms)
    this.flushTimer = setInterval(() => {
      this.flushQueue();
    }, 2000);
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Flush any pending events immediately
    this.flushQueue();

    if (this.server) {
      // Destroy all active sockets to ensure port is freed immediately
      for (const socket of this.sockets) {
        socket.destroy();
      }
      this.sockets.clear();

      await new Promise<void>(resolve => {
        this.server?.close(() => resolve());
        this.server = null;
      });
    }

    this.isRunning = false;
  }

  refreshTokenCache(): void {
    try {
      this.tokenCache = this.repository.getAllServiceSecretHashes();
    } catch (err) {
      console.warn('[DevPulse ApiIngestionServer] Failed to refresh token cache:', err);
    }
  }

  registerServiceToken(serviceId: string, plainToken: string): string {
    const hash = crypto.createHash('sha256').update(plainToken).digest('hex');
    this.tokenCache.set(hash, serviceId);
    return hash;
  }

  getStatus(): IngestionServerStatus {
    return {
      running: this.isRunning,
      host: this.settings.apiIngestionHost || '127.0.0.1',
      port: this.activePort,
      activeConnections: this.sockets.size,
      queueSize: this.queue.length,
      error: this.lastError
    };
  }

  updateSettings(settings: DevPulseSettings): void {
    const portChanged = settings.apiIngestionPort !== this.settings.apiIngestionPort;
    const hostChanged = settings.apiIngestionHost !== this.settings.apiIngestionHost;
    this.settings = settings;

    if (portChanged || hostChanged) {
      void (async () => {
        await this.stop();
        if (settings.apiMonitoringEnabled) {
          await this.start();
        }
      })();
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // CORS headers for local tooling
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-devpulse-token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    // Health check
    if (req.method === 'GET' && (url === '/api/v1/health' || url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: '0.4.0',
        activePort: this.activePort,
        serviceCount: this.tokenCache.size
      }));
      return;
    }

    // Ingestion endpoint: POST /api/v1/events
    if (req.method === 'POST' && (url === '/api/v1/events' || url === '/events')) {
      // 1. Rate Limiting Check (500 req/sec)
      const now = Date.now();
      if (now - this.rateWindowStart > 1000) {
        this.rateWindowStart = now;
        this.rateCount = 0;
      }
      this.rateCount++;
      if (this.rateCount > 500) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '1' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded (max 500 req/s)' }));
        return;
      }

      // 2. Authentication Check
      const authHeader = req.headers['authorization'] || '';
      const customTokenHeader = req.headers['x-devpulse-token'];
      let token = '';

      if (typeof customTokenHeader === 'string' && customTokenHeader.trim()) {
        token = customTokenHeader.trim();
      } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }

      const authenticatedServiceId = this.authenticateToken(token);
      if (!authenticatedServiceId) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing service token' }));
        return;
      }

      // 3. Payload size check (Max 64KB)
      let body = '';
      let bodySize = 0;
      const MAX_BODY_SIZE = 64 * 1024; // 64 KB

      req.on('data', chunk => {
        bodySize += chunk.length;
        if (bodySize > MAX_BODY_SIZE) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload exceeds 64KB limit' }));
          req.destroy();
          return;
        }
        body += chunk;
      });

      req.on('end', () => {
        if (bodySize > MAX_BODY_SIZE) return;

        try {
          const parsed = JSON.parse(body);
          const rawEvents = Array.isArray(parsed) ? parsed : [parsed];
          let acceptedCount = 0;

          for (const ev of rawEvents) {
            const normalized = this.normalizeEvent(ev, authenticatedServiceId);
            if (normalized) {
              if (this.queue.length < (this.settings.apiMaxQueueSize || 1000)) {
                this.queue.push(normalized);
                acceptedCount++;
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ accepted: true, count: acceptedCount }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private authenticateToken(token: string): string | null {
    if (!token) return null;
    const clientHash = crypto.createHash('sha256').update(token).digest('hex');

    for (const [knownHash, serviceId] of this.tokenCache.entries()) {
      if (knownHash.length === clientHash.length) {
        if (crypto.timingSafeEqual(Buffer.from(knownHash), Buffer.from(clientHash))) {
          return serviceId;
        }
      }
    }
    return null;
  }

  private normalizeEvent(raw: any, serviceId: string): ApiRequestEventItem | null {
    if (!raw || typeof raw !== 'object') return null;

    const method = String(raw.method || 'GET').toUpperCase();
    const rawEndpoint = String(raw.endpoint || raw.path || '/');
    const normalizedRoute = this.normalizeRoute(rawEndpoint);
    const statusCode = Number(raw.statusCode || raw.status || 200);
    const durationMs = Math.max(0, Number(raw.durationMs || raw.latencyMs || 0));
    const now = Date.now();
    const completedAt = Number(raw.completedAt || raw.timestamp || now);
    const isError = statusCode >= 400 || raw.outcome === 'failure';

    let errorCategory: string | undefined = raw.errorCategory;
    if (!errorCategory && isError) {
      if (statusCode >= 400 && statusCode < 500) errorCategory = '4xx';
      else if (statusCode >= 500) errorCategory = '5xx';
      else errorCategory = 'failure';
    }

    return {
      id: crypto.randomUUID(),
      serviceId,
      endpointId: `${serviceId}:${method}:${normalizedRoute}`,
      routeTemplate: normalizedRoute,
      method,
      statusCode,
      durationMs,
      startedAt: raw.startedAt ? Number(raw.startedAt) : (completedAt - Math.round(durationMs)),
      completedAt,
      outcome: isError ? 'failure' : 'success',
      errorCategory,
      environment: raw.environment || 'development',
      requestSizeBytes: raw.requestSizeBytes ? Number(raw.requestSizeBytes) : undefined,
      responseSizeBytes: raw.responseSizeBytes ? Number(raw.responseSizeBytes) : undefined
    };
  }

  private normalizeRoute(rawRoute: string): string {
    // Strip query parameters
    let path = rawRoute.split('?')[0].split('#')[0] || '/';

    // Collapse multiple consecutive slashes
    path = path.replace(/\/+/g, '/');

    // Replace UUIDs: 8-4-4-4-12 hex chars -> :id
    path = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id');

    // Replace Mongo ObjectIds: 24 hex chars -> :id
    path = path.replace(/[0-9a-f]{24}/gi, ':id');

    // Replace trailing numeric IDs: /users/123 -> /users/:id
    path = path.replace(/\/(\d+)(\/|$)/g, '/:id$2');

    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      this.repository.recordBatchEvents(batch);
      this.repository.prune(this.settings.apiMaxQueueSize ? 10000 : 10000, this.settings.apiRawEventRetentionDays || 7);
    } catch (err) {
      console.warn('[DevPulse ApiIngestionServer] Failed to flush events batch:', err);
    }
  }
}
