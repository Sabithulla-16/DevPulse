import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import initSqlJs from 'sql.js';
import { runMigrations } from '../src/database/migrations';
import { ApiTestingRepository } from '../src/database/repositories/ApiTestingRepository';
import { RequestExecutor } from '../src/api-testing/core/RequestExecutor';
import { VariableResolver } from '../src/api-testing/core/VariableResolver';
import { CollectionRunner } from '../src/api-testing/runner/CollectionRunner';
import { DEFAULT_SETTINGS } from '../src/shared/defaultSettings';

describe('Phase 5: API Testing Studio - Network Engine & Collection Runner Suite', () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  let executor: RequestExecutor;
  let runner: CollectionRunner;
  let repo: ApiTestingRepository;

  beforeAll(async () => {
    // 1. Spin up a lightweight local HTTP test server
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        if (url.pathname === '/echo') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'X-Echo-Method': req.method || 'GET',
              'X-Echo-Auth': req.headers['authorization'] || 'none'
            });
            res.end(JSON.stringify({
              method: req.method,
              query: Object.fromEntries(url.searchParams.entries()),
              headers: req.headers,
              body: body ? JSON.parse(body) : null
            }));
          });
          return;
        }

        if (url.pathname === '/set-session') {
          res.writeHead(200, {
            'Set-Cookie': 'sessionId=devpulse-token-xyz; Path=/',
            'Content-Type': 'text/plain'
          });
          res.end('cookie set');
          return;
        }

        if (url.pathname === '/check-session') {
          const cookie = req.headers['cookie'] || '';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ hasSession: cookie.includes('sessionId=devpulse-token-xyz') }));
          return;
        }

        if (url.pathname === '/failing') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server Error' }));
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // 2. Initialize in-memory database and repositories
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    runMigrations(db);
    repo = new ApiTestingRepository(() => db);

    const resolver = new VariableResolver();
    executor = new RequestExecutor(resolver);
    runner = new CollectionRunner(executor, repo);

    // Pre-create test collections for foreign key validity
    repo.createCollection({
      id: 'col-test',
      name: 'Test Collection',
      authType: 'inherit',
      sortOrder: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    repo.createCollection({
      id: 'col-fail',
      name: 'Fail Collection',
      authType: 'inherit',
      sortOrder: 2,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('executes GET request with query params and captures real timings', async () => {
    const result = await executor.execute(
      {
        executionId: 'exec-1',
        request: {
          name: 'Echo Test',
          method: 'GET',
          url: `${baseUrl}/echo`,
          params: [
            { id: '1', key: 'filter', value: 'active', enabled: true },
            { id: '2', key: 'limit', value: '10', enabled: true },
            { id: '3', key: 'disabledParam', value: 'ignored', enabled: false }
          ],
          headers: [{ id: '1', key: 'X-Custom-Client', value: 'DevPulse-Test', enabled: true }],
          bodyType: 'none',
          auth: { type: 'none' }
        }
      },
      {},
      DEFAULT_SETTINGS
    );

    expect(result.statusCode).toBe(200);
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(result.body);
    expect(parsed.query.filter).toBe('active');
    expect(parsed.query.limit).toBe('10');
    expect(parsed.query.disabledParam).toBeUndefined();
    expect(parsed.headers['x-custom-client']).toBe('DevPulse-Test');
  });

  it('executes POST request with JSON payload and Bearer token', async () => {
    const result = await executor.execute(
      {
        executionId: 'exec-2',
        request: {
          name: 'Post Echo',
          method: 'POST',
          url: `${baseUrl}/echo`,
          params: [],
          headers: [],
          bodyType: 'json',
          bodyContent: JSON.stringify({ message: 'Hello from DevPulse' }),
          auth: {
            type: 'bearer',
            bearer: { token: 'my-bearer-token' }
          }
        }
      },
      {},
      DEFAULT_SETTINGS
    );

    expect(result.statusCode).toBe(200);
    expect(result.headers['x-echo-auth']).toBe('Bearer my-bearer-token');
    const parsed = JSON.parse(result.body);
    expect(parsed.body.message).toBe('Hello from DevPulse');
  });

  it('maintains cookies in CookieJar across sequential requests', async () => {
    // 1. Call /set-session -> CookieJar stores Set-Cookie
    const res1 = await executor.execute(
      {
        executionId: 'exec-cookie-1',
        request: {
          name: 'Set Session',
          method: 'GET',
          url: `${baseUrl}/set-session`,
          params: [],
          headers: [],
          bodyType: 'none',
          auth: { type: 'none' }
        }
      },
      {},
      DEFAULT_SETTINGS
    );
    expect(res1.statusCode).toBe(200);

    // 2. Call /check-session -> CookieJar automatically attaches Cookie header
    const res2 = await executor.execute(
      {
        executionId: 'exec-cookie-2',
        request: {
          name: 'Check Session',
          method: 'GET',
          url: `${baseUrl}/check-session`,
          params: [],
          headers: [],
          bodyType: 'none',
          auth: { type: 'none' }
        }
      },
      {},
      DEFAULT_SETTINGS
    );
    expect(res2.statusCode).toBe(200);
    const parsed = JSON.parse(res2.body);
    expect(parsed.hasSession).toBe(true);
  });

  it('executes a collection run with CSV data-driven iterations', async () => {
    const csvContent = `username,role
alice,admin
bob,editor
charlie,viewer`;

    const summary = await runner.run(
      {
        runId: 'run-csv-test',
        collectionId: 'col-test',
        iterations: 3,
        delayMs: 10,
        stopOnFailure: false,
        dataFileContent: csvContent,
        dataFileType: 'csv'
      },
      [
        {
          id: 'req-echo-user',
          name: 'Echo User',
          method: 'POST',
          url: `${baseUrl}/echo`,
          params: [],
          headers: [],
          bodyType: 'json',
          bodyContent: JSON.stringify({ user: '{{username}}', role: '{{role}}' }),
          auth: { type: 'none' },
          testScript: `
            pm.test("Status is 200", () => {
              pm.response.to.have.status(200);
            });
            pm.test("Body echoes user", () => {
              const b = pm.response.json();
              pm.expect(b.body.user).to.be.a("string");
            });
          `
        }
      ],
      {},
      DEFAULT_SETTINGS
    );

    expect(summary.status).toBe('completed');
    expect(summary.iterationCount).toBe(3);
    expect(summary.totalRequests).toBe(3);
    expect(summary.passedAssertions).toBe(6); // 2 tests * 3 iterations
    expect(summary.failedAssertions).toBe(0);
  });

  it('handles stop on failure correctly when assertion fails', async () => {
    const summary = await runner.run(
      {
        runId: 'run-fail-test',
        collectionId: 'col-fail',
        iterations: 1,
        delayMs: 0,
        stopOnFailure: true
      },
      [
        {
          id: 'req-fail',
          name: 'Failing Test Request',
          method: 'GET',
          url: `${baseUrl}/failing`,
          params: [],
          headers: [],
          bodyType: 'none',
          auth: { type: 'none' },
          testScript: `
            pm.test("Assert 200 on 500", () => {
              pm.response.to.have.status(200);
            });
          `
        },
        {
          id: 'req-unreachable',
          name: 'Should Not Run',
          method: 'GET',
          url: `${baseUrl}/echo`,
          params: [],
          headers: [],
          bodyType: 'none',
          auth: { type: 'none' }
        }
      ],
      {},
      DEFAULT_SETTINGS
    );

    expect(summary.status).toBe('failed');
    expect(summary.totalRequests).toBe(1); // Stopped after first request
    expect(summary.failedAssertions).toBe(1);
  });
});
