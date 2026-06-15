import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from '../billing/billing.service';
import { TemplatesService } from '../templates/templates.service';
import { MinecraftVersionsService } from './minecraft-versions.service';

/**
 * Public storefront catalog. No auth — these feed the unauthenticated buy flow.
 * Products are resolved by slug (active only); templates/categories drive the
 * game picker.
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly minecraftVersions: MinecraftVersionsService,
  ) {}

  @Get('products')
  products() {
    return this.billing.listProducts();
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.billing.getActiveProductBySlug(slug);
  }

  @Get('categories')
  categories() {
    return this.templates.listCategories();
  }

  @Get('templates')
  templatesList(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.templates.listActive({ categoryId, search });
  }

  /**
   * Released Minecraft (Java Edition) versions for the version picker, newest
   * first. Sourced from Mojang's manifest (cached ~1h) with a hardcoded
   * fallback — always returns a non-empty list.
   */
  @Get('minecraft-versions')
  async minecraftVersionsList() {
    return { versions: await this.minecraftVersions.list() };
  }
}
