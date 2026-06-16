import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingResolver } from './billing.resolver';
import { StripeWebhookController } from './webhooks/stripe-webhook.controller';
import { StripeGateway } from './gateways/stripe.gateway';
import { PayPalGateway } from './gateways/paypal.gateway';
import { PAYMENT_GATEWAY } from './gateways/payment-gateway.interface';
import { QUEUE } from '../queues/queue.constants';

/**
 * Billing feature module: product catalog, subscriptions, invoicing, tax, and
 * payment-gateway integrations. PrismaModule, ConfigModule and AuthModule (which
 * exports the guards) are @Global so are not re-imported here. The BullMQ root
 * is registered in app.module; we register the specific queues we produce to.
 *
 * StripeGateway is bound to the PAYMENT_GATEWAY token as the default gateway;
 * PayPalGateway is also provided for per-call routing.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE.BILLING_RENEWAL },
      { name: QUEUE.SUSPENSION },
      { name: QUEUE.PROVISIONING },
    ),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    BillingService,
    BillingResolver,
    StripeGateway,
    PayPalGateway,
    { provide: PAYMENT_GATEWAY, useExisting: StripeGateway },
  ],
  exports: [BillingService],
})
export class BillingModule {}
