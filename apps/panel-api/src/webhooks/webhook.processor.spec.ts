import { createHmac } from 'crypto';
import { WebhookProcessor } from './webhook.processor';
import { JOB } from '../queues/queue.constants';

/**
 * Unit tests for WebhookProcessor — the outbound delivery worker. SettingsService
 * and global fetch are mocked.
 *
 * Guards under test:
 *   - no url/secret OR event not allowlisted → ACK (no fetch, no throw);
 *   - signs the EXACT raw body with HMAC-SHA256 keyed by the shared secret,
 *     sends the X-ReFx-* headers, and the delivery id is stable;
 *   - 2xx (incl. 202) → ACK; non-2xx → throw (so BullMQ retries).
 */
describe('WebhookProcessor', () => {
  const payload = {
    event: 'ticket.created',
    occurredAt: '2026-06-18T00:00:00.000Z',
    data: { ticketId: 't-1' },
  };
  const job = (overrides: any = {}) => ({
    name: JOB.DELIVER_WEBHOOK,
    data: { event: 'ticket.created', deliveryId: 'del-1', payload },
    ...overrides,
  });

  let settings: { getWebhookConfig: jest.Mock };
  let fetchMock: jest.Mock;
  let processor: WebhookProcessor;

  beforeEach(() => {
    settings = {
      getWebhookConfig: jest.fn().mockResolvedValue({
        url: 'https://ops.example/hook',
        secret: 'shh',
        events: ['ticket.created'],
      }),
    };
    fetchMock = jest.fn().mockResolvedValue({ status: 202 });
    (global as any).fetch = fetchMock;
    processor = new WebhookProcessor(settings as any);
  });

  it('skips (ACK) when no url/secret is configured', async () => {
    settings.getWebhookConfig.mockResolvedValueOnce({ url: '', secret: '', events: [] });
    await expect(processor.process(job() as any)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips (ACK) when the event is not in the allowlist', async () => {
    settings.getWebhookConfig.mockResolvedValueOnce({
      url: 'https://ops.example/hook',
      secret: 'shh',
      events: ['something.else'],
    });
    await expect(processor.process(job() as any)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs the exact body and sends the X-ReFx headers, ACKing on 2xx', async () => {
    await processor.process(job() as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ops.example/hook');
    expect(init.method).toBe('POST');

    const rawBody = JSON.stringify(payload);
    expect(init.body).toBe(rawBody);

    const expected =
      'sha256=' + createHmac('sha256', 'shh').update(rawBody).digest('hex');
    expect(init.headers['X-ReFx-Signature']).toBe(expected);
    expect(init.headers['X-ReFx-Event']).toBe('ticket.created');
    expect(init.headers['X-ReFx-Delivery']).toBe('del-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(typeof init.headers['X-ReFx-Timestamp']).toBe('string');
  });

  it('throws on a non-2xx response so BullMQ retries', async () => {
    fetchMock.mockResolvedValueOnce({ status: 500 });
    await expect(processor.process(job() as any)).rejects.toThrow();
  });
});
