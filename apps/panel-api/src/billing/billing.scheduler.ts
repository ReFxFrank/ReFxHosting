import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BillingService } from './billing.service';
import { AppConfig } from '../config/configuration';
import { JOB, QUEUE, BillingRenewalJob } from '../queues/queue.constants';

/**
 * Drives recurring billing. Once an hour it sweeps for:
 *   - subscriptions whose period has ended → enqueue a RENEW job, and
 *   - PAST_DUE subscriptions → enqueue a DUNNING retry.
 *
 * Jobs are enqueued with a deterministic `jobId` so that if multiple panel-api
 * instances run the cron concurrently, BullMQ collapses the duplicates — making
 * the sweep safe to run on every instance without double-charging.
 * `removeOnComplete` frees the id so the next due window can re-enqueue.
 */
@Injectable()
export class BillingScheduler {
  private readonly logger = new Logger(BillingScheduler.name);
  private readonly enabled: boolean;

  constructor(
    private readonly billing: BillingService,
    config: ConfigService,
    @InjectQueue(QUEUE.BILLING_RENEWAL)
    private readonly renewalQueue: Queue<BillingRenewalJob>,
  ) {
    this.enabled = config.get<AppConfig['billing']>('billing')!.schedulerEnabled;
    if (!this.enabled) {
      this.logger.log('Billing scheduler disabled (BILLING_SCHEDULER=false).');
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (!this.enabled) return;
    await this.enqueueRenewals();
    await this.enqueueDunning();
  }

  /** Hourly: nudge orders that were placed but never paid (sent once). */
  @Cron(CronExpression.EVERY_HOUR)
  async checkoutReminders(): Promise<void> {
    if (!this.enabled) return;
    const n = await this.billing.sendCheckoutReminders();
    if (n) this.logger.log(`Sent ${n} abandoned-checkout reminder(s).`);
  }

  /** Daily: proactive "your subscription renews soon" reminders. */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async renewalReminders(): Promise<void> {
    if (!this.enabled) return;
    const n = await this.billing.sendRenewalReminders();
    if (n) this.logger.log(`Sent ${n} renewal reminder(s).`);
  }

  /** Monthly: warn owners whose default card expires this month. */
  @Cron('0 9 1 * *')
  async cardExpiryReminders(): Promise<void> {
    if (!this.enabled) return;
    const n = await this.billing.sendCardExpiryReminders();
    if (n) this.logger.log(`Sent ${n} card-expiry reminder(s).`);
  }

  /** Enqueue a renewal for each subscription whose period has ended. */
  async enqueueRenewals(): Promise<number> {
    const ids = await this.billing.findDueSubscriptions();
    await Promise.all(
      ids.map((subscriptionId) =>
        this.renewalQueue.add(
          JOB.RENEW,
          { subscriptionId },
          { jobId: `renew:${subscriptionId}`, removeOnComplete: true, removeOnFail: 100 },
        ),
      ),
    );
    if (ids.length) this.logger.log(`Enqueued ${ids.length} renewal(s).`);
    return ids.length;
  }

  /** Enqueue a dunning retry for each past-due subscription. */
  async enqueueDunning(): Promise<number> {
    const ids = await this.billing.findPastDueSubscriptions();
    await Promise.all(
      ids.map((subscriptionId) =>
        this.renewalQueue.add(
          JOB.DUNNING,
          { subscriptionId },
          { jobId: `dunning:${subscriptionId}`, removeOnComplete: true, removeOnFail: 100 },
        ),
      ),
    );
    if (ids.length) this.logger.log(`Enqueued ${ids.length} dunning retry(ies).`);
    return ids.length;
  }
}
