import { createHmac } from 'node:crypto';
import { signWebhookBody, verifyWebhookSignature } from './webhook-signing';

/**
 * The webhook signing acceptance: `X-ReFx-Signature: sha256=<hex>` is
 * HMAC-SHA256(secret, rawBody) and verifies against the stored secret.
 */
describe('webhook signing', () => {
  const secret = 'whsec_test_0123456789';
  const body = JSON.stringify({
    event: 'incident.created',
    timestamp: '2026-06-30T00:00:00.000Z',
    data: { id: 'inc1', title: 'Node outage', status: 'INVESTIGATING' },
  });

  it('produces sha256=<hex of HMAC-SHA256(secret, body)>', () => {
    const expected =
      'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(signWebhookBody(secret, body)).toBe(expected);
  });

  it('verifies a signature a receiver recomputes over the raw body', () => {
    const header = signWebhookBody(secret, body);
    // Receiver side: recompute over the exact bytes it received.
    expect(verifyWebhookSignature(secret, body, header)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signWebhookBody(secret, body);
    const tampered = body.replace('Node outage', 'Nothing wrong');
    expect(verifyWebhookSignature(secret, tampered, header)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signWebhookBody(secret, body);
    expect(verifyWebhookSignature('whsec_other', body, header)).toBe(false);
  });

  it('rejects a malformed/short signature without throwing', () => {
    expect(verifyWebhookSignature(secret, body, 'sha256=deadbeef')).toBe(false);
    expect(verifyWebhookSignature(secret, body, '')).toBe(false);
  });
});
