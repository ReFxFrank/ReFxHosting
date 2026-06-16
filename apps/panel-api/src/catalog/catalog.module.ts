import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { MinecraftVersionsService } from './minecraft-versions.service';
import { StorefrontService } from './storefront.service';
import { BillingModule } from '../billing/billing.module';
import { TemplatesModule } from '../templates/templates.module';
import { NodesModule } from '../nodes/nodes.module';

/**
 * Public storefront catalog module. Delegates to BillingService (products),
 * TemplatesService (categories + active templates) and StorefrontService (public
 * games + pricing). HomepageAlertsService comes from the @Global PlatformModule.
 */
@Module({
  imports: [BillingModule, TemplatesModule, NodesModule],
  controllers: [CatalogController],
  providers: [MinecraftVersionsService, StorefrontService],
})
export class CatalogModule {}
