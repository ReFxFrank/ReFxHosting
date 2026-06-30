import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE } from '../queues/queue.constants';
import { StatusModule } from '../status/status.module';
import { WebhooksService } from './webhooks.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { StatusEventsService } from './status-events.service';

/**
 * Outbound status webhooks: subscription store + dispatch (WebhooksService), the
 * BullMQ delivery worker (signs + POSTs with retry), and the component-change
 * watcher. @Global so IncidentsService (PlatformModule) and the admin controller
 * can inject WebhooksService without import wiring — mirrors PlatformModule.
 * StatusModule is imported for StatusService (used by the component watcher).
 */
@Global()
@Module({
  imports: [
    StatusModule,
    BullModule.registerQueue({ name: QUEUE.WEBHOOK_DELIVERY }),
  ],
  providers: [WebhooksService, WebhookDeliveryProcessor, StatusEventsService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
