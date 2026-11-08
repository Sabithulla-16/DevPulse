export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
}

export class CookieJar {
  private cookies = new Map<string, StoredCookie>();

  setCookie(rawHeader: string, requestUrl: URL): void {
    const parts = rawHeader.split(';').map(p => p.trim());
    if (parts.length === 0 || !parts[0]) return;

    const firstEq = parts[0].indexOf('=');
    if (firstEq <= 0) return;

    const name = parts[0].slice(0, firstEq).trim();
    const value = parts[0].slice(firstEq + 1).trim();

    let domain = requestUrl.hostname.toLowerCase();
    let path = '/';
    let expires: number | undefined;
    let secure = false;
    let httpOnly = false;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const eqIdx = part.indexOf('=');
      const key = (eqIdx > 0 ? part.slice(0, eqIdx) : part).trim().toLowerCase();
      const val = eqIdx > 0 ? part.slice(eqIdx + 1).trim() : '';

      if (key === 'domain' && val) {
        domain = val.startsWith('.') ? val.slice(1).toLowerCase() : val.toLowerCase();
      } else if (key === 'path' && val) {
        path = val;
      } else if (key === 'expires' && val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) expires = d.getTime();
      } else if (key === 'max-age' && val) {
        const seconds = parseInt(val, 10);
        if (!isNaN(seconds)) expires = Date.now() + seconds * 1000;
      } else if (key === 'secure') {
        secure = true;
      } else if (key === 'httponly') {
        httpOnly = true;
      }
    }

    const key = `${domain}:${path}:${name}`;
    this.cookies.set(key, {
      name,
      value,
      domain,
      path,
      expires,
      secure,
      httpOnly
    });
  }

  getCookieHeader(requestUrl: URL): string | undefined {
    const matched = this.getMatchingCookies(requestUrl);
    if (matched.length === 0) return undefined;
    return matched.map(c => `${c.name}=${c.value}`).join('; ');
  }

  getMatchingCookies(requestUrl: URL): StoredCookie[] {
    const hostname = requestUrl.hostname.toLowerCase();
    const pathname = requestUrl.pathname || '/';
    const isHttps = requestUrl.protocol === 'https:';
    const now = Date.now();

    const result: StoredCookie[] = [];
    for (const [key, cookie] of this.cookies.entries()) {
      if (cookie.expires && cookie.expires < now) {
        this.cookies.delete(key);
        continue;
      }

      // Domain match: exact match or subdomain
      const domainMatches = hostname === cookie.domain || hostname.endsWith(`.${cookie.domain}`);
      if (!domainMatches) continue;

      // Path match: prefix match
      const pathMatches = pathname.startsWith(cookie.path);
      if (!pathMatches) continue;

      // Secure match
      if (cookie.secure && !isHttps) continue;

      result.push(cookie);
    }

    return result;
  }

  getAllCookies(): StoredCookie[] {
    const now = Date.now();
    const result: StoredCookie[] = [];
    for (const [key, cookie] of this.cookies.entries()) {
      if (cookie.expires && cookie.expires < now) {
        this.cookies.delete(key);
      } else {
        result.push({ ...cookie });
      }
    }
    return result;
  }

  clear(): void {
    this.cookies.clear();
  }
}
