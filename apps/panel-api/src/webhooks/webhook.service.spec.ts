import { WebhookService } from './webhook.service';
import { JOB } from '../queues/queue.constants';

/**
 * Unit tests for WebhookService — the outbound webhook producer. The BullMQ
 * queue is mocked; we assert the enqueued job's shape, not real delivery.
 *
 * Guards under test:
 *   - emit() builds the { event, occurredAt, data } envelope once and attaches a
 *     stable delivery id used as the BullMQ jobId (idempotency key);
 *   - retries/backoff options are set on the job;
 *   - an enqueue failure is swallowed (never propagates to the business caller).
 */
describe('WebhookService', () => {
  let queue: { add: jest.Mock };
  let service: WebhookService;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    service = new WebhookService(queue as any);
  });

  it('enqueues the DELIVER_WEBHOOK job with the envelope and a stable delivery id', async () => {
    await service.emit('ticket.created', { ticketId: 't-1' });

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = queue.add.mock.calls[0];
    expect(name).toBe(JOB.DELIVER_WEBHOOK);

    // Envelope built once, carried verbatim.
    expect(data.event).toBe('ticket.created');
    expect(data.payload.event).toBe('ticket.created');
    expect(data.payload.data).toEqual({ ticketId: 't-1' });
    expect(typeof data.payload.occurredAt).toBe('string');
    expect(() => new Date(data.payload.occurredAt).toISOString()).not.toThrow();

    // The delivery id is the idempotency key: present, non-empty, and the jobId.
    expect(data.deliveryId).toBeTruthy();
    expect(opts.jobId).toBe(data.deliveryId);

    // Retry semantics: a few attempts with exponential backoff.
    expect(opts.attempts).toBe(5);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });

  it('swallows enqueue failures so a business caller is never broken', async () => {
    queue.add.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.emit('node.state.changed', { nodeId: 'n-1' })).resolves.toBeUndefined();
  });
});
