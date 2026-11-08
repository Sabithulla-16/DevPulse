import type { ApiTestRequestPayload } from '../../types';

export function exportRequestToCurl(request: ApiTestRequestPayload, maskSecrets = false): string {
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
  } else if (request.auth.type === 'apikey' && request.auth.apiKey) {
    const val = maskSecrets ? '••••••••' : request.auth.apiKey.value;
    if (request.auth.apiKey.in === 'header') {
      parts.push(`-H '${request.auth.apiKey.key}: ${val}'`);
    }
  }

  // Body
  if (request.bodyType !== 'none' && request.bodyContent) {
    parts.push(`-d '${request.bodyContent.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(' \\\n  ');
}
