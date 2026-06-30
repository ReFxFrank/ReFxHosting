import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Sign a raw webhook body. The value of the `X-ReFx-Signature` header is
 * `sha256=<hex>` where `<hex>` is HMAC-SHA256(secret, rawBody). Consumers
 * recompute this over the raw request body and compare in constant time.
 */
export function signWebhookBody(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time verification of an `X-ReFx-Signature` header value. */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string,
): boolean {
  const expected = signWebhookBody(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
