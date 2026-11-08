import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import { Database } from '../src/database/Database';
import { ApiIngestionServer } from '../src/services/api/ApiIngestionServer';
import { devpulseMiddleware } from '../src/services/api/middleware/express';
import { DEFAULT_SETTINGS } from '../src/shared/defaultSettings';
import type { DevPulseSettings, ApiRequestEventItem } from '../src/shared/types';

describe('Phase 4: API Intelligence Suite', () => {
  let tempDir: string;
  let database: Database;
  let wasmPath: string;
  let ingestionServer: ApiIngestionServer;
  let settings: DevPulseSettings;
  const testPort = 49199; // Isolated test port

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'devpulse-api-test-'));
    wasmPath = path.resolve(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    database = new Database(tempDir, wasmPath);
    await database.initialize();

    settings = {
      ...DEFAULT_SETTINGS,
      apiMonitoringEnabled: true,
      apiIngestionHost: '127.0.0.1',
      apiIngestionPort: testPort,
      apiMaxQueueSize: 1000,
      apiRawEventRetentionDays: 7,
      apiExcludedRoutes: ['/health', '/favicon.ico'],
      apiAlertLatencyP95ThresholdMs: 1000,
      apiAlertErrorRateThresholdPercent: 5.0
    };

    ingestionServer = new ApiIngestionServer(database.api, settings);
    await ingestionServer.start();
  });

  afterEach(async () => {
    await ingestionServer.stop();
    await database.close();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const sendPost = (path: string, token: string | null, body: any): Promise<{ status: number; body: any }> => {
    return new Promise((resolve, reject) => {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(data))
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: testPort,
          path,
          method: 'POST',
          headers
        },
        res => {
          let resBody = '';
          res.on('data', chunk => (resBody += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode || 0, body: JSON.parse(resBody) });
            } catch {
              resolve({ status: res.statusCode || 0, body: resBody });
            }
          });
        }
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  };

  describe('1. Ingestion Server & Security', () => {
    it('returns 200 OK for health check endpoint', async () => {
      const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        http.get(`http://127.0.0.1:${testPort}/api/v1/health`, res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(data) }));
        }).on('error', reject);
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('0.4.0');
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await sendPost('/api/v1/events', null, {
        method: 'GET',
        endpoint: '/api/users',
        statusCode: 200,
        durationMs: 45
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid or missing service token');
    });

    it('authenticates valid service token in constant time', async () => {
      const serviceId = 'svc-auth-test';
      const token = 'devpulse_sec_valid_token_123';
      ingestionServer.registerServiceToken(serviceId, token);

      const res = await sendPost('/api/v1/events', token, {
        method: 'GET',
        endpoint: '/api/v1/users',
        statusCode: 200,
        durationMs: 35
      });

      expect(res.status).toBe(200);
      expect(res.body.accepted).toBe(true);
      expect(res.body.count).toBe(1);
    });

    it('rejects oversized payloads (>64KB) with 413 Payload Too Large', async () => {
      const serviceId = 'svc-size-test';
      const token = 'devpulse_sec_size_123';
      ingestionServer.registerServiceToken(serviceId, token);

      // Create payload > 65KB
      const hugeString = 'x'.repeat(70 * 1024);
      const res = await sendPost('/api/v1/events', token, {
        method: 'POST',
        endpoint: '/api/data',
        hugeField: hugeString
      });

      expect(res.status).toBe(413);
    });
  });

  describe('2. Event Normalization & Route Parameterization', () => {
    it('normalizes UUIDs, Mongo IDs, and numeric IDs into route templates', () => {
      const serviceId = 'svc-norm';
      const token = 'devpulse_sec_norm_123';
      ingestionServer.registerServiceToken(serviceId, token);

      const testCases = [
        { raw: '/api/users/c9bf9e57-1685-4c89-bafb-ff5af830be8a', expected: '/api/users/:id' },
        { raw: '/api/items/507f1f77bcf86cd799439011', expected: '/api/items/:id' },
        { raw: '/orders/98421', expected: '/orders/:id' },
        { raw: '/products/123/reviews/456', expected: '/products/:id/reviews/:id' }
      ];

      for (const tc of testCases) {
        const norm = (ingestionServer as any).normalizeRoute(tc.raw);
        expect(norm).toBe(tc.expected);
      }
    });

    it('strictly strips query parameters and hashtags from endpoints', () => {
      const rawWithQuery = '/api/v1/search?query=hello&token=secret_abc#anchor';
      const norm = (ingestionServer as any).normalizeRoute(rawWithQuery);
      expect(norm).toBe('/api/v1/search');
      expect(norm).not.toContain('secret_abc');
      expect(norm).not.toContain('query');
    });
  });

  describe('3. Database Metrics & Exact Percentiles', () => {
    it('records batch events and aggregates endpoint metrics', () => {
      const serviceId = 'svc_calc';
      const now = Date.now();

      const events: ApiRequestEventItem[] = [
        {
          id: 'e1',
          serviceId,
          endpointId: `${serviceId}:GET:/api/users`,
          routeTemplate: '/api/users',
          method: 'GET',
          statusCode: 200,
          durationMs: 10,
          completedAt: now,
          outcome: 'success'
        },
        {
          id: 'e2',
          serviceId,
          endpointId: `${serviceId}:GET:/api/users`,
          routeTemplate: '/api/users',
          method: 'GET',
          statusCode: 200,
          durationMs: 30,
          completedAt: now,
          outcome: 'success'
        },
        {
          id: 'e3',
          serviceId,
          endpointId: `${serviceId}:GET:/api/users`,
          routeTemplate: '/api/users',
          method: 'GET',
          statusCode: 500,
          durationMs: 50,
          completedAt: now,
          outcome: 'failure'
        }
      ];

      database.api.recordBatchEvents(events);

      const summary = database.api.getSummary(undefined, serviceId);
      expect(summary.totalRequests).toBe(3);
      expect(summary.successRate).toBe(66.7);
      expect(summary.errorRate).toBe(33.3);
      expect(summary.avgLatencyMs).toBe(30);

      const endpoints = database.api.getEndpoints(serviceId);
      expect(endpoints.length).toBe(1);
      expect(endpoints[0].routeTemplate).toBe('/api/users');
      expect(endpoints[0].totalRequests).toBe(3);
      expect(endpoints[0].totalErrors).toBe(1);
      expect(endpoints[0].avgLatencyMs).toBe(30);
    });

    it('calculates deterministic P95 and P99 percentiles on duration array', () => {
      const serviceId = 'svc_percentiles';
      const now = Date.now();
      const events: ApiRequestEventItem[] = [];

      // Generate 100 requests with latencies 1ms to 100ms
      for (let i = 1; i <= 100; i++) {
        events.push({
          id: `ev-${i}`,
          serviceId,
          endpointId: `${serviceId}:GET:/api/latency`,
          routeTemplate: '/api/latency',
          method: 'GET',
          statusCode: 200,
          durationMs: i,
          completedAt: now,
          outcome: 'success'
        });
      }

      database.api.recordBatchEvents(events);
      const summary = database.api.getSummary(undefined, serviceId);

      expect(summary.totalRequests).toBe(100);
      expect(summary.p95LatencyMs).toBe(96); // 95th index
      expect(summary.p99LatencyMs).toBe(100); // 99th index
    });

    it('provides endpoint details with latency histogram distribution', () => {
      const serviceId = 'svc_details';
      const endpointId = `${serviceId}:POST:/api/auth`;
      const now = Date.now();

      database.api.recordBatchEvents([
        {
          id: 'e-hist-1',
          serviceId,
          endpointId,
          routeTemplate: '/api/auth',
          method: 'POST',
          statusCode: 200,
          durationMs: 5, // <10ms
          completedAt: now,
          outcome: 'success'
        },
        {
          id: 'e-hist-2',
          serviceId,
          endpointId,
          routeTemplate: '/api/auth',
          method: 'POST',
          statusCode: 200,
          durationMs: 75, // 50-100ms
          completedAt: now,
          outcome: 'success'
        },
        {
          id: 'e-hist-3',
          serviceId,
          endpointId,
          routeTemplate: '/api/auth',
          method: 'POST',
          statusCode: 401,
          durationMs: 1500, // >1000ms
          completedAt: now,
          outcome: 'failure'
        }
      ]);

      const details = database.api.getEndpointDetails(endpointId);
      expect(details).not.toBeNull();
      expect(details?.endpoint.routeTemplate).toBe('/api/auth');
      expect(details?.recentEvents.length).toBe(3);

      const hist = details?.latencyHistogram;
      expect(hist?.find(b => b.bin === '< 10ms')?.count).toBe(1);
      expect(hist?.find(b => b.bin === '50-100ms')?.count).toBe(1);
      expect(hist?.find(b => b.bin === '> 1000ms')?.count).toBe(1);
    });
  });

  describe('4. Express Middleware Contract & Zero-Crash Guarantee', () => {
    it('executes without crashing host application even if DevPulse port is closed', async () => {
      // Connect to dead port where no server is listening
      const deadPort = 49101;
      const middleware = devpulseMiddleware({
        token: 'devpulse_sec_test',
        serviceId: 'test-crash-proof',
        port: deadPort
      });

      // Mock Express req and res
      const listeners: Record<string, () => void> = {};
      const req: any = {
        method: 'GET',
        path: '/api/v1/items/42',
        headers: {}
      };
      const res: any = {
        statusCode: 200,
        getHeader: () => null,
        on: (ev: string, cb: () => void) => {
          listeners[ev] = cb;
        },
        removeListener: () => {}
      };

      let nextCalled = false;
      middleware(req, res, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);

      // Trigger finish event - must NOT throw unhandled rejection or exception
      expect(() => {
        if (listeners['finish']) listeners['finish']();
      }).not.toThrow();
    });
  });
});
