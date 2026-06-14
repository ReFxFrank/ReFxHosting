import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BillingService } from '../../billing/billing.service';
import { BillingRenewalJob, JOB, QUEUE } from '../queue.constants';

/**
 * Renewal + dunning worker.
 *   - JOB.RENEW: renew a single subscription (invoice + charge + period roll).
 *   - JOB.DUNNING: re-attempt the latest open invoice for a past-due
 *     subscription; repeated failures keep it suspended (handled in billing).
 *
 * A scheduler (cron) enqueues RENEW jobs from BillingService.findDueSubscriptions
 * and DUNNING jobs for PAST_DUE subscriptions. TODO(impl): wire the cron via
 * @nestjs/schedule or a repeatable BullMQ job.
 */
@Processor(QUEUE.BILLING_RENEWAL)
export class BillingRenewalProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingRenewalProcessor.name);

  constructor(private readonly billing: BillingService) {
    super();
  }

  async process(job: Job<BillingRenewalJob>): Promise<void> {
    const { subscriptionId } = job.data;
    if (job.name === JOB.RENEW || job.name === JOB.DUNNING) {
      const outcome = await this.billing.renewSubscription(subscriptionId);
      this.logger.log(
        `${job.name} ${subscriptionId}: ${outcome.paid ? 'paid' : 'failed'}` +
          (outcome.reason ? ` (${outcome.reason})` : ''),
      );
    }
  }
}
