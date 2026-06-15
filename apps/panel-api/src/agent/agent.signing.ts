import { createHash, createHmac } from 'crypto';

/**
 * Canonical panel <-> node-agent request signing.
 *
 * Both directions (panel -> agent control calls AND agent -> panel callbacks)
 * use the SAME algorithm and header names so either side can verify the other.
 * The canonical algorithm is the one implemented by the Go agent in
 * `apps/node-agent/internal/panel/signing.go`:
 *
 *   signature = HMAC_SHA256(key, "METHOD\nPATH\nTIMESTAMP\nSHA256hex(body)")
 *
 *   - METHOD    : uppercase HTTP method
 *   - PATH      : request path WITHOUT query string (matches Go's r.URL.Path)
 *   - TIMESTAMP : unix seconds (string)
 *   - body      : raw request body bytes ("" when there is no body)
 *
 * Header names (identical both ways):
 *   X-Refx-Node       node id
 *   X-Refx-Timestamp  unix seconds
 *   X-Refx-Signature  hex HMAC
 */

export const SIGN_HEADER_NODE = 'x-refx-node';
export const SIGN_HEADER_TIMESTAMP = 'x-refx-timestamp';
export const SIGN_HEADER_SIGNATURE = 'x-refx-signature';

/** Allowed clock drift for verifying inbound signatures, in seconds. */
export const MAX_CLOCK_SKEW_SEC = 5 * 60;

/**
 * Per-node signing key. Deterministically derived from the global secrets key
 * plus the node id, so the panel can recompute it on every request without
 * persisting a new column (the Prisma schema is frozen). The agent receives the
 * exact same value at register time and uses it as-is.
 *
 * Must stay byte-for-byte identical to the agent's expectation.
 */
export function deriveSigningKey(secretsEncKey: string, nodeId: string): string {
  return createHash('sha256')
    .update(`${secretsEncKey}:${nodeId}`)
    .digest('hex');
}

/** Strip a query string from a request path for canonicalization. */
function pathWithoutQuery(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

/** Produce the canonical HMAC-SHA256 signature for a request. */
export function signRequest(
  key: string,
  method: string,
  path: string,
  timestamp: string,
  body: string,
): string {
  const bodyHash = createHash('sha256').update(body ?? '').digest('hex');
  const canonical = `${method.toUpperCase()}\n${pathWithoutQuery(
    path,
  )}\n${timestamp}\n${bodyHash}`;
  return createHmac('sha256', key).update(canonical).digest('hex');
}

/**
 * Verify an inbound signature in constant time and enforce the replay window.
 * `body` is the raw request body string.
 */
export function verifyRequest(
  key: string,
  method: string,
  path: string,
  timestamp: string,
  signature: string,
  body: string,
): boolean {
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_CLOCK_SKEW_SEC) return false;
  const expected = signRequest(key, method, path, timestamp, body);
  // timingSafeEqual requires equal-length buffers; compare hex strings.
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
