import * as vm from 'node:vm';
import * as crypto from 'node:crypto';

export interface ScriptExecutionInput {
  script: string;
  stage: 'prerequest' | 'test';
  variables: Map<string, string>;
  environment: Map<string, string>;
  globals: Map<string, string>;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  };
  response?: {
    code: number;
    status: string;
    headers: Record<string, string>;
    body: string;
    responseTimeMs: number;
  };
  timeoutMs?: number;
}

export interface ScriptExecutionOutput {
  success: boolean;
  testResults: { name: string; passed: boolean; errorMessage?: string }[];
  scriptLogs: { level: 'log' | 'warn' | 'error'; message: string; timestamp: number }[];
  environmentUpdates: Map<string, string>;
  variableUpdates: Map<string, string>;
  globalUpdates: Map<string, string>;
  error?: string;
}

export class ScriptSandbox {
  async execute(input: ScriptExecutionInput): Promise<ScriptExecutionOutput> {
    const testResults: { name: string; passed: boolean; errorMessage?: string }[] = [];
    const scriptLogs: { level: 'log' | 'warn' | 'error'; message: string; timestamp: number }[] = [];
    const environmentUpdates = new Map<string, string>();
    const variableUpdates = new Map<string, string>();
    const globalUpdates = new Map<string, string>();

    if (!input.script || !input.script.trim()) {
      return {
        success: true,
        testResults,
        scriptLogs,
        environmentUpdates,
        variableUpdates,
        globalUpdates
      };
    }

    const logCapture = (level: 'log' | 'warn' | 'error') => (...args: unknown[]) => {
      const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      scriptLogs.push({ level, message: msg, timestamp: Date.now() });
    };

    // Build Expect Assertion Helper
    function createExpect(actual: unknown, isNot = false): any {
      const assertion = {
        to: {
          equal: (expected: unknown) => {
            const pass = actual === expected;
            if (isNot ? pass : !pass) {
              throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to equal' : 'to equal'} ${JSON.stringify(expected)}`);
            }
          },
          be: {
            a: (type: string) => {
              let actualType: string = typeof actual;
              if (Array.isArray(actual)) actualType = 'array';
              if (actual === null) actualType = 'null';
              const pass = actualType === type.toLowerCase();
              if (isNot ? pass : !pass) {
                throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be a' : 'to be a'} ${type} (got ${actualType})`);
              }
            },
            an: (type: string) => assertion.to.be.a(type),
            below: (n: number) => {
              const pass = Number(actual) < n;
              if (isNot ? pass : !pass) {
                throw new Error(`Expected ${actual} ${isNot ? 'not to be below' : 'to be below'} ${n}`);
              }
            },
            above: (n: number) => {
              const pass = Number(actual) > n;
              if (isNot ? pass : !pass) {
                throw new Error(`Expected ${actual} ${isNot ? 'not to be above' : 'to be above'} ${n}`);
              }
            },
            get true() {
              const pass = actual === true;
              if (isNot ? pass : !pass) {
                throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be true' : 'to be true'}`);
              }
              return true;
            },
            get false() {
              const pass = actual === false;
              if (isNot ? pass : !pass) {
                throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to be false' : 'to be false'}`);
              }
              return true;
            }
          },
          have: {
            property: (prop: string, val?: unknown) => {
              if (!actual || typeof actual !== 'object') {
                throw new Error(`Expected object to have property "${prop}", got ${typeof actual}`);
              }
              const has = Object.prototype.hasOwnProperty.call(actual, prop);
              if (isNot ? has : !has) {
                throw new Error(`Expected object ${isNot ? 'not to have' : 'to have'} property "${prop}"`);
              }
              if (val !== undefined && (actual as any)[prop] !== val) {
                throw new Error(`Expected property "${prop}" to equal ${JSON.stringify(val)}, got ${JSON.stringify((actual as any)[prop])}`);
              }
            },
            status: (code: number) => {
              const resCode = input.response?.code;
              const pass = resCode === code;
              if (isNot ? pass : !pass) {
                throw new Error(`Expected status code ${isNot ? 'not to be' : 'to be'} ${code}, got ${resCode}`);
              }
            }
          },
          include: (val: unknown) => {
            let pass = false;
            if (typeof actual === 'string' && typeof val === 'string') {
              pass = actual.includes(val);
            } else if (Array.isArray(actual)) {
              pass = actual.includes(val);
            } else if (actual && typeof actual === 'object' && typeof val === 'string') {
              pass = val in actual;
            }
            if (isNot ? pass : !pass) {
              throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not to include' : 'to include'} ${JSON.stringify(val)}`);
            }
          }
        },
        get not() {
          return createExpect(actual, !isNot);
        }
      };
      return assertion;
    }

    // Build Postman `pm` Object
    const pm = {
      environment: {
        get: (key: string) => environmentUpdates.get(key) ?? input.environment.get(key),
        set: (key: string, value: unknown) => environmentUpdates.set(key, String(value)),
        unset: (key: string) => environmentUpdates.delete(key)
      },
      variables: {
        get: (key: string) =>
          variableUpdates.get(key) ??
          environmentUpdates.get(key) ??
          input.variables.get(key) ??
          input.environment.get(key) ??
          input.globals.get(key),
        set: (key: string, value: unknown) => variableUpdates.set(key, String(value))
      },
      globals: {
        get: (key: string) => globalUpdates.get(key) ?? input.globals.get(key),
        set: (key: string, value: unknown) => globalUpdates.set(key, String(value))
      },
      request: {
        url: input.request.url,
        method: input.request.method,
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            for (const [k, v] of Object.entries(input.request.headers)) {
              if (k.toLowerCase() === lower) return v;
            }
            return undefined;
          }
        }
      },
      response: input.response
        ? {
            code: input.response.code,
            status: input.response.status,
            responseTime: input.response.responseTimeMs,
            headers: {
              get: (name: string) => {
                const lower = name.toLowerCase();
                for (const [k, v] of Object.entries(input.response!.headers)) {
                  if (k.toLowerCase() === lower) return v;
                }
                return undefined;
              }
            },
            json: () => {
              try {
                return JSON.parse(input.response!.body);
              } catch {
                throw new Error('Response body is not valid JSON');
              }
            },
            text: () => input.response!.body,
            to: {
              have: {
                status: (code: number) => {
                  if (input.response!.code !== code) {
                    throw new Error(`Expected response status code to be ${code}, but got ${input.response!.code}`);
                  }
                }
              }
            }
          }
        : undefined,
      test: (testName: string, testFn: () => void) => {
        try {
          testFn();
          testResults.push({ name: testName, passed: true });
        } catch (err: any) {
          testResults.push({
            name: testName,
            passed: false,
            errorMessage: err?.message || String(err)
          });
        }
      },
      expect: (actual: unknown) => createExpect(actual)
    };

    // Crypto Helpers for Scripts
    const cryptoHelper = {
      md5: (str: string) => crypto.createHash('md5').update(str).digest('hex'),
      sha1: (str: string) => crypto.createHash('sha1').update(str).digest('hex'),
      sha256: (str: string) => crypto.createHash('sha256').update(str).digest('hex'),
      base64Encode: (str: string) => Buffer.from(str).toString('base64'),
      base64Decode: (str: string) => Buffer.from(str, 'base64').toString('utf-8')
    };

    // Sandbox Context Object
    const sandboxContext: Record<string, unknown> = {
      pm,
      console: {
        log: logCapture('log'),
        warn: logCapture('warn'),
        error: logCapture('error')
      },
      crypto: cryptoHelper,
      JSON,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      RegExp,
      Array,
      Object,
      String,
      Number,
      Boolean,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI
    };

    const context = vm.createContext(sandboxContext);
    const timeoutMs = input.timeoutMs || 1500;

    try {
      const scriptToRun = new vm.Script(input.script);
      scriptToRun.runInContext(context, {
        timeout: timeoutMs,
        displayErrors: true
      });
      return {
        success: true,
        testResults,
        scriptLogs,
        environmentUpdates,
        variableUpdates,
        globalUpdates
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      scriptLogs.push({
        level: 'error',
        message: `Script runtime error: ${errorMessage}`,
        timestamp: Date.now()
      });
      return {
        success: false,
        testResults,
        scriptLogs,
        environmentUpdates,
        variableUpdates,
        globalUpdates,
        error: errorMessage
      };
    }
  }
}
