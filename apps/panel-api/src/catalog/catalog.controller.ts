import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { BillingService } from '../billing/billing.service';
import { TemplatesService } from '../templates/templates.service';
import { NodesService } from '../nodes/nodes.service';
import { MinecraftVersionsService } from './minecraft-versions.service';
import { StorefrontService } from './storefront.service';
import { HomepageAlertsService } from '../platform/homepage-alerts.service';
import { StaffService } from '../platform/staff.service';

/**
 * Public storefront catalog. No auth — these feed the unauthenticated buy flow.
 * Products are resolved by slug (active only); templates/categories drive the
 * game picker; `games`/`homepage-alerts` power the public marketing storefront.
 */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly billing: BillingService,
    private readonly templates: TemplatesService,
    private readonly nodes: NodesService,
    private readonly minecraftVersions: MinecraftVersionsService,
    private readonly storefront: StorefrontService,
    private readonly homepageAlerts: HomepageAlertsService,
    private readonly staff: StaffService,
  ) {}

  /** Locations (regions) with capacity for a given config — storefront picker. */
  @Get('locations')
  locations(
    @Query('cpuCores') cpuCores?: string,
    @Query('memoryMb') memoryMb?: string,
    @Query('diskMb') diskMb?: string,
  ) {
    return this.nodes.regionsWithCapacity({
      cpuCores: Number(cpuCores) || 0,
      memoryMb: Number(memoryMb) || 0,
      diskMb: Number(diskMb) || 0,
    });
  }

  /** Nodes in a region with capacity for a given config — storefront node picker. */
  @Get('nodes')
  nodes_(
    @Query('regionId') regionId: string,
    @Query('cpuCores') cpuCores?: string,
    @Query('memoryMb') memoryMb?: string,
    @Query('diskMb') diskMb?: string,
  ) {
    if (!regionId) return [];
    return this.nodes.nodesWithCapacity(regionId, {
      cpuCores: Number(cpuCores) || 0,
      memoryMb: Number(memoryMb) || 0,
      diskMb: Number(diskMb) || 0,
    });
  }

  // ---- public storefront --------------------------------------------------

  /** Published games for the public homepage/catalog (safe fields + price). */
  @Get('games')
  games() {
    return this.storefront.listGames();
  }

  /** One published game with its orderable plans + locations (404 if hidden). */
  @Get('games/:slug')
  game(@Param('slug') slug: string) {
    return this.storefront.getGame(slug);
  }

  /** Active, in-window public homepage notices (separate from dashboard alerts). */
  @Get('homepage-alerts')
  homepageAlertsList() {
    return this.homepageAlerts.listActive();
  }

  /** Public "Meet the team" members (active only). */
  @Get('team')
  team() {
    return this.staff.listActive();
  }

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
   * Minecraft versions for the version picker, newest first, scoped to the chosen
   * loader (vanilla/paper/fabric/forge/neoforge) so it only offers versions that
   * loader can actually build. Sourced live from each loader's upstream (cached
   * ~1h) with a graceful fallback — vanilla always returns a non-empty list.
   */
  @Get('minecraft-versions')
  async minecraftVersionsList(@Query('loader') loader?: string) {
    return { versions: await this.minecraftVersions.list(loader) };
  }

  /**
   * Loader build versions for a given Minecraft version, newest first — the
   * Fabric loader / Forge build / NeoForge build dropdown. Empty for loaders with
   * no build concept (vanilla/paper auto-pick the newest server build).
   */
  @Get('minecraft-builds')
  async minecraftBuildsList(
    @Query('loader') loader: string,
    @Query('version') version: string,
  ) {
    return { builds: await this.minecraftVersions.builds(loader, version) };
  }
}
