import { describe, it, expect } from 'vitest';
import { SentrySecurityValidator } from '../src/api-testing/security/SentrySecurityValidator';
import { ScriptSandbox } from '../src/api-testing/scripting/ScriptSandbox';

describe('Phase 5: API Testing Studio - Security & Sandbox Suite', () => {
  describe('1. Sentry SSRF Security Validator', () => {
    it('blocks cloud metadata endpoint 169.254.169.254', () => {
      const res = SentrySecurityValidator.validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SSRF Violation');
    });

    it('blocks decimal-encoded IP representation of 169.254.169.254', () => {
      // 2852039166 in decimal is 169.254.169.254
      const res = SentrySecurityValidator.validateUrl('http://2852039166/latest/meta-data/');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SSRF Violation');
    });

    it('blocks metadata.google.internal hostname', () => {
      const res = SentrySecurityValidator.validateUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('SSRF Violation');
    });

    it('blocks non-HTTP protocols such as file: and ftp:', () => {
      const fileRes = SentrySecurityValidator.validateUrl('file:///etc/passwd');
      expect(fileRes.valid).toBe(false);
      expect(fileRes.error).toContain('Prohibited protocol');

      const ftpRes = SentrySecurityValidator.validateUrl('ftp://example.com/test');
      expect(ftpRes.valid).toBe(false);
      expect(ftpRes.error).toContain('Prohibited protocol');
    });

    it('safely allows localhost and private development addresses', () => {
      const localRes1 = SentrySecurityValidator.validateUrl('http://localhost:3000/api/users');
      expect(localRes1.valid).toBe(true);

      const localRes2 = SentrySecurityValidator.validateUrl('http://127.0.0.1:8080/health');
      expect(localRes2.valid).toBe(true);

      const privateRes = SentrySecurityValidator.validateUrl('http://192.168.1.50:5000/status');
      expect(privateRes.valid).toBe(true);
    });
  });

  describe('2. Script Sandbox & Postman Compatibility', () => {
    const sandbox = new ScriptSandbox();

    it('executes pre-request scripts and updates environment & variables', async () => {
      const script = `
        pm.environment.set("token", "secret-token-123");
        pm.variables.set("timestamp", "1700000000");
        console.log("Pre-request script executed");
      `;

      const result = await sandbox.execute({
        script,
        stage: 'prerequest',
        variables: new Map(),
        environment: new Map(),
        globals: new Map(),
        request: {
          url: 'http://localhost:3000/api',
          method: 'GET',
          headers: {}
        }
      });

      expect(result.success).toBe(true);
      expect(result.environmentUpdates.get('token')).toBe('secret-token-123');
      expect(result.variableUpdates.get('timestamp')).toBe('1700000000');
      expect(result.scriptLogs.some(l => l.message.includes('Pre-request script executed'))).toBe(true);
    });

    it('executes post-response test assertions with pm.expect and pm.response', async () => {
      const script = `
        pm.test("Status is 200", () => {
          pm.response.to.have.status(200);
        });

        pm.test("Body has user ID", () => {
          const data = pm.response.json();
          pm.expect(data).to.have.property("id", 42);
          pm.expect(data.name).to.be.a("string");
          pm.expect(data.roles).to.include("admin");
        });

        pm.test("Response time is fast", () => {
          pm.expect(pm.response.responseTime).to.be.below(500);
        });
      `;

      const result = await sandbox.execute({
        script,
        stage: 'test',
        variables: new Map(),
        environment: new Map(),
        globals: new Map(),
        request: {
          url: 'http://localhost:3000/api/user',
          method: 'GET',
          headers: {}
        },
        response: {
          code: 200,
          status: 'OK',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: 42, name: 'Alice', roles: ['user', 'admin'] }),
          responseTimeMs: 85
        }
      });

      expect(result.success).toBe(true);
      expect(result.testResults.length).toBe(3);
      expect(result.testResults.every(t => t.passed)).toBe(true);
    });

    it('catches and reports failed assertions gracefully without throwing', async () => {
      const script = `
        pm.test("Failing test expectation", () => {
          pm.expect(pm.response.code).to.equal(201);
        });
      `;

      const result = await sandbox.execute({
        script,
        stage: 'test',
        variables: new Map(),
        environment: new Map(),
        globals: new Map(),
        request: { url: 'http://localhost', method: 'GET', headers: {} },
        response: {
          code: 200,
          status: 'OK',
          headers: {},
          body: '{}',
          responseTimeMs: 50
        }
      });

      expect(result.success).toBe(true);
      expect(result.testResults.length).toBe(1);
      expect(result.testResults[0].passed).toBe(false);
      expect(result.testResults[0].errorMessage).toContain('to equal 201');
    });

    it('enforces execution timeout on infinite loops', async () => {
      const infiniteScript = `
        const start = Date.now();
        while (Date.now() - start < 5000) {}
      `;

      const result = await sandbox.execute({
        script: infiniteScript,
        stage: 'prerequest',
        variables: new Map(),
        environment: new Map(),
        globals: new Map(),
        request: { url: 'http://localhost', method: 'GET', headers: {} },
        timeoutMs: 100
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
