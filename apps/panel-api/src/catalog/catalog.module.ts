import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { MinecraftVersionsService } from './minecraft-versions.service';
import { StorefrontService } from './storefront.service';
import { BillingModule } from '../billing/billing.module';
import { TemplatesModule } from '../templates/templates.module';

/**
 * Public storefront catalog module. Delegates to BillingService (products),
 * TemplatesService (categories + active templates) and StorefrontService (public
 * games + pricing). HomepageAlertsService comes from the @Global PlatformModule.
 */
@Module({
  imports: [BillingModule, TemplatesModule],
  controllers: [CatalogController],
  providers: [MinecraftVersionsService, StorefrontService],
})
export class CatalogModule {}
