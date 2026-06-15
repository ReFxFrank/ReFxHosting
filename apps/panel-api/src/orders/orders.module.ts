import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { BillingModule } from '../billing/billing.module';
import { ServersModule } from '../servers/servers.module';

/**
 * Storefront orders module: orchestrates subscribe → invoice → provision by
 * delegating to BillingService and ServersService.
 */
@Module({
  imports: [BillingModule, ServersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
