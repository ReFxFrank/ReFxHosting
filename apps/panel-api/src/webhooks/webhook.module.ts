import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../queues/queue.constants';
import { WebhookService } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';

/**
 * Outbound webhook delivery (Agent Ops integration). Producers inject
 * WebhookService.emit() to fire-and-enqueue; the WebhookProcessor signs and
 * POSTs off the request path with retries. Marked @Global so Support / Servers /
 * Nodes / Billing can inject WebhookService without re-importing this module.
 *
 * Depends only on the BullMQ queue and the @Global SettingsService — no domain
 * services — to keep it free of circular dependencies.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE.WEBHOOKS })],
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
