import * as http from 'node:http';

export interface DevPulseMiddlewareOptions {
  token: string;
  serviceId?: string;
  host?: string;
  port?: number;
  environment?: string;
  excludedRoutes?: string[];
}

export function devpulseMiddleware(options: DevPulseMiddlewareOptions) {
  const host = options.host || '127.0.0.1';
  const port = options.port || 49152;
  const token = options.token;
  const serviceId = options.serviceId || 'default-service';
  const environment = options.environment || 'development';
  const excluded = new Set(options.excludedRoutes || ['/health', '/favicon.ico']);

  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 5,
    timeout: 1000
  });

  return function (req: any, res: any, next: (err?: any) => void) {
    const startHr = process.hrtime();
    const startTime = Date.now();

    const onFinish = () => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onFinish);

      try {
        const rawPath: string = req.baseUrl ? `${req.baseUrl}${req.path || ''}` : (req.path || req.url || '/');
        const cleanPath = rawPath.split('?')[0].split('#')[0] || '/';

        if (excluded.has(cleanPath)) return;

        const diff = process.hrtime(startHr);
        const durationMs = Math.round((diff[0] * 1000 + diff[1] / 1e6) * 10) / 10;
        const statusCode = res.statusCode || 200;
        const method = (req.method || 'GET').toUpperCase();

        // Parameterize path
        let routeTemplate = (req.baseUrl || '') + (req.route?.path || cleanPath);
        routeTemplate = routeTemplate
          .replace(/\/+/g, '/')
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
          .replace(/[0-9a-f]{24}/gi, ':id')
          .replace(/\/(\d+)(\/|$)/g, '/:id$2');

        const payload = JSON.stringify({
          serviceId,
          method,
          endpoint: routeTemplate,
          statusCode,
          durationMs,
          startedAt: startTime,
          completedAt: Date.now(),
          outcome: statusCode >= 400 ? 'failure' : 'success',
          environment,
          requestSizeBytes: req.headers['content-length'] ? Number(req.headers['content-length']) : undefined,
          responseSizeBytes: res.getHeader('content-length') ? Number(res.getHeader('content-length')) : undefined
        });

        const clientReq = http.request(
          {
            hostname: host,
            port,
            path: '/api/v1/events',
            method: 'POST',
            agent,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'Authorization': `Bearer ${token}`
            },
            timeout: 500
          },
          clientRes => {
            // Consume response so socket frees
            clientRes.resume();
          }
        );

        // Crucial: Silent error handler to guarantee ZERO crash in host app
        clientReq.on('error', () => {
          // DevPulse server offline or unreachable; silently ignore
        });

        clientReq.write(payload);
        clientReq.end();
      } catch {
        // Suppress any unexpected error in telemetry hook
      }
    };

    res.on('finish', onFinish);
    res.on('close', onFinish);

    if (typeof next === 'function') {
      next();
    }
  };
}

/**
 * Clean copyable snippet string for display in webview integration modal
 */
export function getCopyableExpressSnippet(serviceName: string, token: string, port = 49152): string {
  return `// 1. Install or copy DevPulse middleware into your Node.js Express server:
const http = require('http');

function devpulseMiddleware(options) {
  const host = options.host || '127.0.0.1';
  const port = options.port || ${port};
  const token = options.token;
  const serviceId = options.serviceId || '${serviceName}';
  const agent = new http.Agent({ keepAlive: true, maxSockets: 5, timeout: 1000 });

  return function(req, res, next) {
    const startHr = process.hrtime();
    const startTime = Date.now();

    const onFinish = () => {
      res.removeListener('finish', onFinish);
      res.removeListener('close', onFinish);
      try {
        const rawPath = (req.baseUrl || '') + (req.path || req.url || '/').split('?')[0];
        const diff = process.hrtime(startHr);
        const durationMs = Math.round((diff[0] * 1000 + diff[1] / 1e6) * 10) / 10;
        const statusCode = res.statusCode || 200;

        const routeTemplate = ((req.baseUrl || '') + (req.route?.path || rawPath))
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
          .replace(/[0-9a-f]{24}/gi, ':id')
          .replace(/\\/(\\d+)(\\/|$)/g, '/:id$2');

        const payload = JSON.stringify({
          serviceId,
          method: (req.method || 'GET').toUpperCase(),
          endpoint: routeTemplate,
          statusCode,
          durationMs,
          startedAt: startTime,
          completedAt: Date.now(),
          outcome: statusCode >= 400 ? 'failure' : 'success'
        });

        const dispatch = http.request({
          hostname: host,
          port,
          path: '/api/v1/events',
          method: 'POST',
          agent,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'Authorization': 'Bearer ' + token
          },
          timeout: 500
        }, r => r.resume());

        dispatch.on('error', () => {}); // Zero crash guarantee
        dispatch.write(payload);
        dispatch.end();
      } catch {}
    };

    res.on('finish', onFinish);
    res.on('close', onFinish);
    next();
  };
}

// 2. Add to your Express app:
// app.use(devpulseMiddleware({
//   token: '${token}',
//   serviceId: '${serviceName}'
// }));
`;
}
