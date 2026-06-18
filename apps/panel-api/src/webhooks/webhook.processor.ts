import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Job } from 'bullmq';
import { SettingsService } from '../platform/settings.service';
import { JOB, QUEUE, WebhookDeliveryJob } from '../queues/queue.constants';

/** Hard cap on a single delivery attempt (ms) before it's aborted. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Delivers a single outbound webhook with at-least-once semantics. BullMQ drives
 * retries (exponential backoff); this worker decides success/failure:
 *
 *   - no url/secret configured, or event not in the allowlist → ACK (skip).
 *   - 2xx response (incl. 202)                                → ACK.
 *   - non-2xx / network error / timeout                       → throw (retry).
 *
 * The body is serialized once per attempt from the fixed, pre-built envelope, so
 * the signed bytes are stable. The delivery id is stable across retries and is
 * sent as `X-ReFx-Delivery` for receiver-side idempotency.
 */
@Processor(QUEUE.WEBHOOKS)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly settings: SettingsService) {
    super();
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    if (job.name !== JOB.DELIVER_WEBHOOK) return;
    const { event, deliveryId, payload } = job.data;

    const cfg = await this.settings.getWebhookConfig();
    if (!cfg.url || !cfg.secret) return; // not configured → skip
    if (!cfg.events.includes(event)) return; // not allowlisted → skip

    // Serialize once; sign the EXACT bytes we send.
    const rawBody = JSON.stringify(payload);
    const signature = createHmac('sha256', cfg.secret)
      .update(rawBody)
      .digest('hex');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ReFx-Event': event,
          'X-ReFx-Delivery': deliveryId,
          'X-ReFx-Timestamp': new Date().toISOString(),
          'X-ReFx-Signature': `sha256=${signature}`,
        },
        body: rawBody,
        signal: controller.signal,
      });

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`webhook ${event} (${deliveryId}) → HTTP ${res.status}`);
      }
      this.logger.debug(`delivered ${event} (${deliveryId}) → HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(
        `webhook delivery failed ${event} (${deliveryId}): ${(err as Error).message}`,
      );
      throw err; // let BullMQ retry
    } finally {
      clearTimeout(timer);
    }
  }
}
