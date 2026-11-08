import * as http from 'node:http';
import * as https from 'node:https';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { SentrySecurityValidator } from '../security/SentrySecurityValidator';
import { VariableResolver, type ResolutionContext } from './VariableResolver';
import { ScriptSandbox } from '../scripting/ScriptSandbox';
import { CookieJar } from './CookieJar';
import type { SecretManager } from '../security/SecretManager';
import type {
  ApiTestExecutionPayload,
  ApiTestExecutionResult,
  DevPulseSettings
} from '../../shared/types';

export class RequestExecutor {
  private scriptSandbox = new ScriptSandbox();
  private cookieJars = new Map<string, CookieJar>();

  constructor(
    private readonly variableResolver: VariableResolver,
    private readonly secretManager?: SecretManager,
    private readonly onTelemetryEvent?: (event: any) => void
  ) {}

  getCookieJar(environmentId?: string | null): CookieJar {
    const key = environmentId || '__default__';
    if (!this.cookieJars.has(key)) {
      this.cookieJars.set(key, new CookieJar());
    }
    return this.cookieJars.get(key)!;
  }

  async execute(
    payload: ApiTestExecutionPayload,
    resolutionContext: ResolutionContext,
    settings: DevPulseSettings,
    abortSignal?: AbortSignal
  ): Promise<ApiTestExecutionResult> {
    const executedAt = Date.now();
    const timing = {
      dnsMs: 0,
      tcpMs: 0,
      tlsMs: 0,
      ttfbMs: 0,
      downloadMs: 0,
      totalMs: 0,
      socketReused: false
    };

    const cookieJar = this.getCookieJar(payload.environmentId);
    let variableMap = await this.variableResolver.buildVariableMap(resolutionContext, false);

    // 1. Pre-Request Script Stage
    let scriptLogs: { level: 'log' | 'warn' | 'error'; message: string; timestamp: number }[] = [];
    if (payload.request.preRequestScript && payload.request.preRequestScript.trim()) {
      const preResult = await this.scriptSandbox.execute({
        script: payload.request.preRequestScript,
        stage: 'prerequest',
        variables: variableMap,
        environment: new Map(),
        globals: new Map(),
        request: {
          url: payload.request.url,
          method: payload.request.method,
          headers: this.variableResolver.interpolateHeaders(payload.request.headers || [], variableMap),
          body: payload.request.bodyContent
        },
        timeoutMs: settings.apiTestingScriptTimeoutMs || 1500
      });
      scriptLogs.push(...preResult.scriptLogs);

      // Apply script variable updates
      for (const [k, v] of preResult.variableUpdates.entries()) {
        variableMap.set(k, v);
      }
      for (const [k, v] of preResult.environmentUpdates.entries()) {
        variableMap.set(k, v);
      }
    }

    // 2. Variable Interpolation
    let targetUrlString = this.variableResolver.interpolate(payload.request.url, variableMap);

    // Append Query Parameters
    const params = this.variableResolver.interpolateParams(payload.request.params || [], variableMap);
    if (params.length > 0) {
      const joinChar = targetUrlString.includes('?') ? '&' : '?';
      const queryString = params
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      targetUrlString = `${targetUrlString}${joinChar}${queryString}`;
    }

    const headers = this.variableResolver.interpolateHeaders(payload.request.headers || [], variableMap);

    // Apply Authentication
    await this.applyAuthentication(payload.request.auth, headers, variableMap);

    // 3. SSRF & Protocol Validation
    const validation = SentrySecurityValidator.validateUrl(targetUrlString);
    if (!validation.valid || !validation.url) {
      return {
        executionId: payload.executionId,
        requestId: payload.request.id,
        statusCode: 0,
        statusText: 'Validation Error',
        durationMs: 0,
        timing,
        headers: {},
        cookies: [],
        body: '',
        responseSizeBytes: 0,
        testResults: [],
        scriptLogs,
        executedAt,
        error: validation.error || 'Invalid URL'
      };
    }

    // Attach Cookies from CookieJar
    const cookieHeader = cookieJar.getCookieHeader(validation.url);
    if (cookieHeader && !headers['Cookie'] && !headers['cookie']) {
      headers['Cookie'] = cookieHeader;
    }

    // 4. Request Body Preparation
    let requestBody: Buffer | string | undefined;
    if (payload.request.bodyType !== 'none' && payload.request.bodyContent) {
      const interpolatedBody = this.variableResolver.interpolate(payload.request.bodyContent, variableMap);
      if (payload.request.bodyType === 'json') {
        requestBody = interpolatedBody;
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else if (payload.request.bodyType === 'urlencoded') {
        requestBody = interpolatedBody;
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else {
        requestBody = interpolatedBody;
      }
    }

    // 5. HTTP Network Dispatch with Redirect Handling
    const maxRedirects = settings.apiTestingFollowRedirectsLimit ?? 10;
    const maxBodyBytes = (settings.apiTestingMaxResponseBodySizeMb || 20) * 1024 * 1024;
    const timeoutMs = payload.request.settings?.timeoutMs || settings.apiTestingDefaultTimeoutMs || 30000;
    const rejectUnauthorized = payload.request.settings?.rejectUnauthorized ?? true;

    try {
      const httpResult = await this.performHttpRequest({
        url: validation.url,
        method: payload.request.method.toUpperCase(),
        headers,
        body: requestBody,
        cookieJar,
        maxRedirects,
        maxBodyBytes,
        timeoutMs,
        rejectUnauthorized,
        abortSignal
      });

      // 6. Post-Response Script / Test Stage
      const testResults: { name: string; passed: boolean; errorMessage?: string }[] = [];
      if (payload.request.testScript && payload.request.testScript.trim()) {
        const testScriptResult = await this.scriptSandbox.execute({
          script: payload.request.testScript,
          stage: 'test',
          variables: variableMap,
          environment: new Map(),
          globals: new Map(),
          request: {
            url: targetUrlString,
            method: payload.request.method,
            headers,
            body: typeof requestBody === 'string' ? requestBody : undefined
          },
          response: {
            code: httpResult.statusCode,
            status: httpResult.statusText,
            headers: httpResult.headers,
            body: httpResult.body,
            responseTimeMs: httpResult.durationMs
          },
          timeoutMs: settings.apiTestingScriptTimeoutMs || 1500
        });
        scriptLogs.push(...testScriptResult.scriptLogs);
        testResults.push(...testScriptResult.testResults);
      }

      // 7. Optional Telemetry Integration
      if (settings.apiTestingLogToApiIntelligence && this.onTelemetryEvent) {
        this.onTelemetryEvent({
          source: 'api_testing_studio',
          url: targetUrlString,
          method: payload.request.method,
          statusCode: httpResult.statusCode,
          durationMs: httpResult.durationMs,
          timestamp: executedAt
        });
      }

      const matchingCookies = cookieJar.getMatchingCookies(validation.url);

      return {
        executionId: payload.executionId,
        requestId: payload.request.id,
        statusCode: httpResult.statusCode,
        statusText: httpResult.statusText,
        durationMs: httpResult.durationMs,
        timing: httpResult.timing,
        headers: httpResult.headers,
        cookies: matchingCookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly
        })),
        body: httpResult.body,
        responseSizeBytes: httpResult.responseSizeBytes,
        testResults,
        scriptLogs,
        executedAt
      };
    } catch (err: any) {
      return {
        executionId: payload.executionId,
        requestId: payload.request.id,
        statusCode: 0,
        statusText: 'Network Error',
        durationMs: timing.totalMs,
        timing,
        headers: {},
        cookies: [],
        body: '',
        responseSizeBytes: 0,
        testResults: [],
        scriptLogs,
        executedAt,
        error: err?.message || String(err)
      };
    }
  }

  private async applyAuthentication(
    auth: any,
    headers: Record<string, string>,
    variableMap: Map<string, string>
  ): Promise<void> {
    if (!auth || auth.type === 'inherit' || auth.type === 'none') {
      return;
    }

    if (auth.type === 'bearer' && auth.bearer) {
      let token = auth.bearer.token || '';
      if (auth.bearer.secretRef && this.secretManager) {
        token = (await this.secretManager.getSecret(auth.bearer.secretRef)) || token;
      }
      token = this.variableResolver.interpolate(token, variableMap);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (auth.type === 'basic' && auth.basic) {
      let user = this.variableResolver.interpolate(auth.basic.username || '', variableMap);
      let pass = auth.basic.password || '';
      if (auth.basic.secretRef && this.secretManager) {
        pass = (await this.secretManager.getSecret(auth.basic.secretRef)) || pass;
      }
      pass = this.variableResolver.interpolate(pass, variableMap);
      const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else if (auth.type === 'apikey' && auth.apiKey) {
      let key = this.variableResolver.interpolate(auth.apiKey.key || '', variableMap);
      let val = auth.apiKey.value || '';
      if (auth.apiKey.secretRef && this.secretManager) {
        val = (await this.secretManager.getSecret(auth.apiKey.secretRef)) || val;
      }
      val = this.variableResolver.interpolate(val, variableMap);
      if (key && auth.apiKey.in === 'header') {
        headers[key] = val;
      }
    } else if (auth.type === 'oauth2' && auth.oauth2) {
      let token = auth.oauth2.accessToken || '';
      if (auth.oauth2.accessTokenRef && this.secretManager) {
        token = (await this.secretManager.getSecret(auth.oauth2.accessTokenRef)) || token;
      }
      token = this.variableResolver.interpolate(token, variableMap);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }

  private performHttpRequest(options: {
    url: URL;
    method: string;
    headers: Record<string, string>;
    body?: Buffer | string;
    cookieJar: CookieJar;
    maxRedirects: number;
    maxBodyBytes: number;
    timeoutMs: number;
    rejectUnauthorized: boolean;
    abortSignal?: AbortSignal;
  }): Promise<{
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    responseSizeBytes: number;
    durationMs: number;
    timing: any;
  }> {
    return new Promise((resolve, reject) => {
      let currentUrl = options.url;
      let redirectsRemaining = options.maxRedirects;

      const executeSingleHop = (targetUrl: URL) => {
        // Validate SSRF on each hop
        const check = SentrySecurityValidator.validateUrl(targetUrl.toString());
        if (!check.valid || !check.url) {
          return reject(new Error(check.error || 'SSRF check failed on redirect'));
        }

        const isHttps = targetUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const timing = {
          dnsMs: 0,
          tcpMs: 0,
          tlsMs: 0,
          ttfbMs: 0,
          downloadMs: 0,
          totalMs: 0,
          socketReused: false
        };

        const startTime = Date.now();
        let dnsTime = 0;
        let tcpTime = 0;
        let tlsTime = 0;
        let ttfbTime = 0;

        const isCrossOrigin = targetUrl.origin !== options.url.origin;
        let hopHeaders = { ...options.headers };
        if (isCrossOrigin) {
          // SEC-02: Strip sensitive authentication headers on cross-origin redirects
          delete hopHeaders['authorization'];
          delete hopHeaders['Authorization'];
          delete hopHeaders['cookie'];
          delete hopHeaders['Cookie'];
          delete hopHeaders['proxy-authorization'];
          delete hopHeaders['Proxy-Authorization'];
        }

        const reqOptions: http.RequestOptions & { rejectUnauthorized?: boolean } = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (isHttps ? 443 : 80),
          path: `${targetUrl.pathname || '/'}${targetUrl.search || ''}`,
          method: options.method,
          headers: hopHeaders,
          timeout: options.timeoutMs,
          rejectUnauthorized: options.rejectUnauthorized
        };

        const req = client.request(reqOptions, res => {
          ttfbTime = Date.now();
          timing.ttfbMs = Math.max(0, ttfbTime - startTime);

          // Handle Cookies in Response
          const setCookieHeaders = res.headers['set-cookie'];
          if (setCookieHeaders) {
            for (const header of setCookieHeaders) {
              options.cookieJar.setCookie(header, targetUrl);
            }
          }

          // Handle Redirects (301, 302, 303, 307, 308)
          const statusCode = res.statusCode || 200;
          if (
            [301, 302, 303, 307, 308].includes(statusCode) &&
            res.headers.location &&
            redirectsRemaining > 0
          ) {
            redirectsRemaining--;
            let redirectUrl: URL;
            try {
              redirectUrl = new URL(res.headers.location, targetUrl);
            } catch {
              return reject(new Error(`Invalid redirect Location: "${res.headers.location}"`));
            }
            res.resume(); // Discard redirect body stream
            return executeSingleHop(redirectUrl);
          }

          const chunks: Buffer[] = [];
          let receivedBytes = 0;

          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > options.maxBodyBytes) {
              req.destroy(new Error(`Response exceeded maximum limit of ${options.maxBodyBytes / 1024 / 1024} MB`));
              return;
            }
            chunks.push(chunk);
          });

          res.on('end', () => {
            const endTime = Date.now();
            timing.downloadMs = Math.max(0, endTime - ttfbTime);
            timing.totalMs = Math.max(0, endTime - startTime);

            const responseBuffer = Buffer.concat(chunks);
            const bodyString = responseBuffer.toString('utf-8');

            const formattedHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                formattedHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
              }
            }

            resolve({
              statusCode,
              statusText: res.statusMessage || 'OK',
              headers: formattedHeaders,
              body: bodyString,
              responseSizeBytes: receivedBytes,
              durationMs: timing.totalMs,
              timing
            });
          });
        });

        // Socket Event Timings
        req.on('socket', (socket: Socket) => {
          if (socket.connecting) {
            socket.on('lookup', () => {
              dnsTime = Date.now();
              timing.dnsMs = Math.max(0, dnsTime - startTime);
            });
            socket.on('connect', () => {
              tcpTime = Date.now();
              timing.tcpMs = Math.max(0, tcpTime - (dnsTime || startTime));
            });
            if (isHttps) {
              (socket as TLSSocket).on('secureConnect', () => {
                tlsTime = Date.now();
                timing.tlsMs = Math.max(0, tlsTime - (tcpTime || startTime));
              });
            }
          } else {
            timing.socketReused = true;
          }
        });

        req.on('error', err => {
          timing.totalMs = Date.now() - startTime;
          reject(err);
        });

        req.on('timeout', () => {
          req.destroy(new Error(`Request timed out after ${options.timeoutMs}ms`));
        });

        if (options.abortSignal) {
          options.abortSignal.addEventListener('abort', () => {
            req.destroy(new Error('Request cancelled by user'));
          });
        }

        if (options.body) {
          req.write(options.body);
        }
        req.end();
      };

      executeSingleHop(currentUrl);
    });
  }
}
