import * as net from 'node:net';

export class SentrySecurityValidator {
  private static readonly BLOCKED_HOSTNAMES = new Set([
    'metadata.google.internal',
    'metadata.internal',
    'instance-data'
  ]);

  static validateUrl(urlString: string): { valid: boolean; error?: string; url?: URL } {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      return { valid: false, error: `Invalid URL format: "${urlString}"` };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        valid: false,
        error: `Prohibited protocol "${url.protocol}". Only HTTP and HTTPS are permitted.`
      };
    }

    const hostname = url.hostname.toLowerCase();
    if (this.BLOCKED_HOSTNAMES.has(hostname)) {
      return {
        valid: false,
        error: `SSRF Violation: Requests to cloud instance metadata host "${hostname}" are blocked.`
      };
    }

    // Check direct IP or encoded IP representations
    const ipCheck = this.validateIpAddress(hostname);
    if (!ipCheck.valid) {
      return { valid: false, error: ipCheck.error };
    }

    return { valid: true, url };
  }

  static validateIpAddress(ipOrHost: string): { valid: boolean; error?: string } {
    // Check if hostname is decimal integer representation of IP (e.g., 2852039166 = 169.254.169.254)
    if (/^\d+$/.test(ipOrHost)) {
      const num = Number(ipOrHost);
      if (num >= 0 && num <= 0xffffffff) {
        const ip = [
          (num >>> 24) & 255,
          (num >>> 16) & 255,
          (num >>> 8) & 255,
          num & 255
        ].join('.');
        return this.checkIp(ip);
      }
    }

    // Check standard IPv4/IPv6
    if (net.isIP(ipOrHost)) {
      return this.checkIp(ipOrHost);
    }

    return { valid: true };
  }

  private static checkIp(ip: string): { valid: boolean; error?: string } {
    // 169.254.0.0/16 - Link-local / Cloud metadata (AWS, Azure, GCP, DigitalOcean)
    if (ip.startsWith('169.254.')) {
      return {
        valid: false,
        error: `SSRF Violation: Requests to link-local / cloud metadata address "${ip}" are strictly blocked.`
      };
    }

    // IPv6 link-local (fe80::/10, fd00:ec2::/64)
    const normalizedIpv6 = ip.toLowerCase();
    if (normalizedIpv6.startsWith('fe80:') || normalizedIpv6.startsWith('fd00:ec2:')) {
      return {
        valid: false,
        error: `SSRF Violation: Requests to IPv6 cloud metadata address "${ip}" are strictly blocked.`
      };
    }

    // IPv4-mapped IPv6 for 169.254.x.x (e.g. ::ffff:169.254.169.254)
    if (normalizedIpv6.includes('169.254.')) {
      return {
        valid: false,
        error: `SSRF Violation: Requests to IPv4-mapped metadata address "${ip}" are strictly blocked.`
      };
    }

    // Localhost and private development IPs (127.0.0.1, 10.x, 192.168.x, 172.16-31.x) are explicitly allowed
    return { valid: true };
  }
}
