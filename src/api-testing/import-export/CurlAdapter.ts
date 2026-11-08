const generateUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import type { ApiTestRequestPayload, ApiTestKeyValuePair, ApiTestAuthConfig } from '../../shared/types';

export class CurlAdapter {
  static import(curlCommand: string): ApiTestRequestPayload {
    const clean = curlCommand.replace(/\\\r?\n/g, ' ').trim();
    const tokens = this.tokenize(clean);

    let method = 'GET';
    let url = '';
    const headers: ApiTestKeyValuePair[] = [];
    const params: ApiTestKeyValuePair[] = [];
    let bodyType: ApiTestRequestPayload['bodyType'] = 'none';
    let bodyContent: string | undefined;
    let auth: ApiTestAuthConfig = { type: 'none' };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token === '-X' || token === '--request') {
        method = (tokens[++i] || 'GET').toUpperCase();
      } else if (token === '-H' || token === '--header') {
        const headerStr = tokens[++i] || '';
        const colonIdx = headerStr.indexOf(':');
        if (colonIdx > 0) {
          const key = headerStr.slice(0, colonIdx).trim();
          const value = headerStr.slice(colonIdx + 1).trim();
          if (key.toLowerCase() === 'authorization' && value.toLowerCase().startsWith('bearer ')) {
            auth = {
              type: 'bearer',
              bearer: { token: value.slice(7).trim() }
            };
          } else {
            headers.push({
              id: generateUUID(),
              key,
              value,
              enabled: true
            });
          }
        }
      } else if (token === '-d' || token === '--data' || token === '--data-raw') {
        bodyContent = tokens[++i] || '';
        bodyType = 'raw';
        try {
          JSON.parse(bodyContent);
          bodyType = 'json';
        } catch {
          // Keep raw
        }
        if (method === 'GET') method = 'POST';
      } else if (token === '--data-urlencode') {
        bodyContent = tokens[++i] || '';
        bodyType = 'urlencoded';
        if (method === 'GET') method = 'POST';
      } else if (token === '-u' || token === '--user') {
        const userPass = tokens[++i] || '';
        const [username, password] = userPass.split(':');
        auth = {
          type: 'basic',
          basic: { username: username || '', password: password || '' }
        };
      } else if (!token.startsWith('-') && token !== 'curl' && !url) {
        url = token.replace(/^['"]|['"]$/g, '');
      }
    }

    // Extract query params from URL if present
    if (url.includes('?')) {
      const [baseUrl, query] = url.split('?', 2);
      url = baseUrl;
      const searchParams = new URLSearchParams(query);
      for (const [k, v] of searchParams.entries()) {
        params.push({
          id: generateUUID(),
          key: k,
          value: v,
          enabled: true
        });
      }
    }

    return {
      id: generateUUID(),
      name: `${method} ${url || 'Request'}`,
      method,
      url,
      params,
      headers,
      bodyType,
      bodyContent,
      auth,
      sortOrder: 1
    };
  }

  static export(request: ApiTestRequestPayload, maskSecrets = false): string {
    const parts: string[] = ['curl'];

    // Method
    parts.push(`-X ${request.method.toUpperCase()}`);

    // URL + Params
    let targetUrl = request.url;
    const enabledParams = request.params.filter(p => p.enabled && p.key.trim());
    if (enabledParams.length > 0) {
      const join = targetUrl.includes('?') ? '&' : '?';
      const qs = enabledParams
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&');
      targetUrl = `${targetUrl}${join}${qs}`;
    }
    parts.push(`'${targetUrl}'`);

    // Headers
    for (const h of request.headers) {
      if (h.enabled && h.key.trim()) {
        parts.push(`-H '${h.key}: ${h.value}'`);
      }
    }

    // Auth
    if (request.auth.type === 'bearer' && request.auth.bearer?.token) {
      const token = maskSecrets ? '••••••••' : request.auth.bearer.token;
      parts.push(`-H 'Authorization: Bearer ${token}'`);
    } else if (request.auth.type === 'basic' && request.auth.basic) {
      const pass = maskSecrets ? '••••••••' : (request.auth.basic.password || '');
      parts.push(`-u '${request.auth.basic.username || ''}:${pass}'`);
    }

    // Body
    if (request.bodyType !== 'none' && request.bodyContent) {
      parts.push(`-d '${request.bodyContent.replace(/'/g, "'\\''")}'`);
    }

    return parts.join(' \\\n  ');
  }

  private static tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: '"' | "'" | null = null;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '\\' && i + 1 < input.length) {
        current += input[++i];
        continue;
      }

      if (inQuote) {
        if (char === inQuote) {
          inQuote = null;
        } else {
          current += char;
        }
      } else {
        if (char === '"' || char === "'") {
          inQuote = char;
        } else if (/\s/.test(char)) {
          if (current.length > 0) {
            tokens.push(current);
            current = '';
          }
        } else {
          current += char;
        }
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }
}
