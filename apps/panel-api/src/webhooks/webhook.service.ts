import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { uuidv7 } from '../common/util/uuid';
import { JOB, QUEUE, WebhookDeliveryJob } from '../queues/queue.constants';

/**
 * Outbound webhook producer. Builds the delivery envelope once and enqueues a
 * BullMQ job for off-request-path, at-least-once delivery (the processor signs
 * and POSTs with retries). It deliberately depends only on the queue — never on
 * domain services — so any feature module can inject it without circular deps.
 *
 * Delivery is configured by the operator via admin settings (target URL, shared
 * secret, event allowlist); see WebhookProcessor and SettingsService.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectQueue(QUEUE.WEBHOOKS) private readonly webhookQueue: Queue<WebhookDeliveryJob>,
  ) {}

  /**
   * Enqueue an outbound webhook. Builds the `{ event, occurredAt, data }`
   * envelope once and attaches a stable delivery id (uuidv7) used as the
   * idempotency key across retries. Never sends HTTP inline — delivery and the
   * allowlist check happen in the processor. Enqueue failures are swallowed so a
   * caller in a business path is never broken by webhook plumbing.
   */
  async emit(event: string, data: Record<string, unknown>): Promise<void> {
    const deliveryId = uuidv7();
    const payload = {
      event,
      occurredAt: new Date().toISOString(),
      data,
    };
    try {
      await this.webhookQueue.add(
        JOB.DELIVER_WEBHOOK,
        { event, deliveryId, payload },
        {
          jobId: deliveryId,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue webhook ${event} (${deliveryId}): ${(err as Error).message}`,
      );
    }
  }
}
