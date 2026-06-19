/**
 * Resolve the real client IP for security decisions (the API-key IP allowlist).
 *
 * Behind Cloudflare the request's `X-Forwarded-For` / socket address resolve to
 * Cloudflare edge IPs (e.g. 104.x / 172.70.x), and the hop count is not stable,
 * so Express's `req.ip` cannot be relied on. Cloudflare instead puts the
 * authoritative client IP in the `CF-Connecting-IP` header.
 *
 * `CLIENT_IP_HEADER` (e.g. `cf-connecting-ip`) opts into trusting that header.
 * It is OFF by default — when unset we use `req.ip` — because a forwarded-IP
 * header is only trustworthy when the origin is reachable ONLY through the proxy
 * that sets it (lock the origin firewall to Cloudflare's ranges); otherwise a
 * direct caller could spoof it.
 */
export function resolveClientIp(
  req: { ip?: string; headers?: Record<string, unknown> },
  headerName: string | undefined = process.env.CLIENT_IP_HEADER,
): string | undefined {
  if (headerName) {
    const raw = req?.headers?.[headerName.toLowerCase()];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) {
      // A forwarded-for style header may be a comma-separated list; the client
      // is the first entry. CF-Connecting-IP is a single value either way.
      const first = String(value).split(',')[0].trim();
      if (first) return first;
    }
  }
  return req?.ip;
}
