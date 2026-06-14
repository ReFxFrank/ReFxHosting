import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from './queue.constants';
import { ProvisioningProcessor } from './processors/provisioning.processor';
import { ReinstallProcessor } from './processors/reinstall.processor';
import { BackupsProcessor } from './processors/backups.processor';
import { BillingRenewalProcessor } from './processors/billing-renewal.processor';
import { SuspensionProcessor } from './processors/suspension.processor';
import { BillingModule } from '../billing/billing.module';

/**
 * Registers all BullMQ queues and their workers. The processors depend on
 * PrismaService (@Global), NodeAgentClient (@Global AgentModule) and
 * BillingService (imported from BillingModule).
 */
@Module({
  imports: [
    BillingModule,
    BullModule.registerQueue(
      { name: QUEUE.PROVISIONING },
      { name: QUEUE.REINSTALL },
      { name: QUEUE.BACKUPS },
      { name: QUEUE.BILLING_RENEWAL },
      { name: QUEUE.SUSPENSION },
    ),
  ],
  providers: [
    ProvisioningProcessor,
    ReinstallProcessor,
    BackupsProcessor,
    BillingRenewalProcessor,
    SuspensionProcessor,
  ],
})
export class QueuesModule {}
