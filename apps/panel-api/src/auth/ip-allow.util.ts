/**
 * API-key IP allowlist matching.
 *
 * Behind a reverse proxy / load balancer the resolved client IP (Express `req.ip`
 * with `trust proxy` set) is frequently an IPv4-mapped IPv6 address such as
 * `::ffff:15.204.252.217`. A naive `entry === ip` or dotted-quad parse then fails
 * even when the real client IP exactly matches the allowlist. These helpers:
 *   - normalize IPv4-mapped IPv6 (`::ffff:a.b.c.d` -> `a.b.c.d`),
 *   - treat a bare IP as a `/32` (so `1.2.3.4` and `1.2.3.4/32` both match),
 *   - perform real IPv4 CIDR matching,
 *   - fall back to a normalized exact compare for non-IPv4 (IPv6) entries.
 */

/** Strip an IPv4-mapped IPv6 prefix and surrounding whitespace. */
export function normalizeIp(ip: string): string {
  const v = (ip ?? '').trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  return mapped ? mapped[1] : v;
}

/** Parse a dotted-quad IPv4 string to a uint32, or null if it is not valid IPv4. */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

/** True if `ip` matches a single allowlist `entry` (bare IP, IPv4 CIDR, or IPv6). */
export function ipMatchesEntry(ip: string, entry: string): boolean {
  const candidate = normalizeIp(ip);
  const trimmed = (entry ?? '').trim();
  if (!candidate || !trimmed) return false;

  const [rangeRaw, bitsRaw] = trimmed.includes('/')
    ? trimmed.split('/')
    : [trimmed, '32'];
  const range = normalizeIp(rangeRaw);

  const candInt = ipv4ToInt(candidate);
  const rangeInt = ipv4ToInt(range);
  // Non-IPv4 on either side: only a genuine IPv6 literal (contains ':') falls
  // back to a normalized exact compare; a malformed IPv4 never matches.
  if (candInt === null || rangeInt === null) {
    return candidate.includes(':') && candidate === range;
  }

  const bits = Number.parseInt(bitsRaw, 10);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (candInt & mask) === (rangeInt & mask);
}

/** True if `ip` matches any entry in the allowlist. */
export function ipAllowed(ip: string, allow: string[]): boolean {
  return allow.some((entry) => ipMatchesEntry(ip, entry));
}
