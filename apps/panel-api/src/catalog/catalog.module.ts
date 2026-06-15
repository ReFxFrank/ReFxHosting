import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { BillingModule } from '../billing/billing.module';
import { TemplatesModule } from '../templates/templates.module';

/**
 * Public storefront catalog module. Delegates to BillingService (products) and
 * TemplatesService (categories + active templates).
 */
@Module({
  imports: [BillingModule, TemplatesModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
