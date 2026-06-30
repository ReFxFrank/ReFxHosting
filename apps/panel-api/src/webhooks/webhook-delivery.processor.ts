import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { QUEUE, WebhookDeliveryJob } from '../queues/queue.constants';
import { signWebhookBody } from './webhook-signing';

const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Delivers one outbound status webhook: decrypts the subscriber's secret, signs
 * the raw body (HMAC-SHA256), and POSTs it with the X-ReFx-* headers. A non-2xx
 * response (or a network error) throws, so BullMQ retries with the queue's
 * default backoff (attempts: 3, exponential) — at-least-once. The stable
 * `deliveryId` lets the receiver dedupe.
 */
@Processor(QUEUE.WEBHOOK_DELIVERY)
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { webhookId, event, deliveryId, body } = job.data;

    const hook = await this.prisma.statusWebhook.findUnique({
      where: { id: webhookId },
    });
    // Subscription deleted/disabled since enqueue → drop the delivery silently.
    if (!hook || !hook.isActive) return;

    const secret = this.crypto.decrypt(hook.secretEnc);
    const signature = signWebhookBody(secret, body);

    let httpStatus = 0;
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-ReFx-Signature': signature,
          'X-ReFx-Event': event,
          'X-ReFx-Delivery': deliveryId,
          'user-agent': 'ReFx-StatusWebhook/1',
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      httpStatus = res.status;
      await this.recordAttempt(webhookId, httpStatus);
      if (!res.ok) {
        // Triggers a BullMQ retry (attempts: 3 + backoff).
        throw new Error(`webhook ${webhookId} returned HTTP ${httpStatus}`);
      }
    } catch (err) {
      if (!httpStatus) await this.recordAttempt(webhookId, 0);
      this.logger.warn(
        `webhook delivery ${deliveryId} -> ${hook.url} failed: ${String(err)}`,
      );
      throw err; // let BullMQ retry
    }
  }

  private recordAttempt(webhookId: string, status: number): Promise<unknown> {
    return this.prisma.statusWebhook
      .update({
        where: { id: webhookId },
        data: { lastDeliveryAt: new Date(), lastStatus: status },
      })
      .catch(() => undefined);
  }
}
