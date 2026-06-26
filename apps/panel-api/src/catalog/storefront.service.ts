import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Active product + active prices + active hardware tiers (with their prices). */
type PricedProduct = Prisma.ProductGetPayload<{
  include: {
    prices: true;
    hardwareTiers: { include: { prices: true } };
  };
}>;

/** Cheapest recurring price available for a game, or null when unpriced. */
export interface StartingPrice {
  amountMinor: number;
  currency: string;
}

/**
 * Read model for the PUBLIC customer storefront. Exposes only published games and
 * safe, buyer-relevant fields — never install scripts, startup commands, secret
 * variables, or node/provisioning internals. Pricing is derived from the existing
 * billing products (no new pricing concept).
 */
@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  /** Card fields safe to expose publicly for a game. */
  private static readonly CARD_SELECT = {
    id: true,
    name: true,
    slug: true,
    description: true,
    longDescription: true,
    featured: true,
    sortOrder: true,
    cardImageUrl: true,
    heroImageUrl: true,
    iconUrl: true,
    tags: true,
    supportsLinux: true,
    supportsWindows: true,
    recCpuCores: true,
    recMemoryMb: true,
    recDiskMb: true,
    category: { select: { id: true, name: true, slug: true, iconUrl: true } },
  } satisfies Prisma.GameTemplateSelect;

  /** All published games for the homepage/catalog, with a starting price. */
  async listGames() {
    const [games, products] = await Promise.all([
      this.prisma.gameTemplate.findMany({
        where: { isPublished: true },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: StorefrontService.CARD_SELECT,
      }),
      this.activeGameProducts(),
    ]);
    return games.map((g) => ({
      ...g,
      startingPrice: this.startingPrice(g.id, products),
    }));
  }

  /**
   * One published game by slug, plus the plans it can be ordered on and the
   * available server locations. Throws 404 when the game isn't published so a
   * disabled/unknown slug shows a clean "unavailable" page.
   */
  async getGame(slug: string) {
    const game = await this.prisma.gameTemplate.findFirst({
      where: { slug, isPublished: true },
      select: {
        ...StorefrontService.CARD_SELECT,
        author: true,
        deployMethods: true,
        // Buyer-configurable, non-secret variables only.
        variables: {
          where: { userViewable: true, type: { not: 'SECRET' } },
          orderBy: { sortOrder: 'asc' },
          select: {
            envName: true,
            displayName: true,
            description: true,
            type: true,
            defaultValue: true,
            rules: true,
            sortOrder: true,
          },
        },
      },
    });
    if (!game) throw new NotFoundException('Game not available');

    const products = await this.activeGameProducts();
    const plans = products
      .filter((p) => this.productAllows(p, game.id))
      .map((p) => this.toPublicPlan(p));
    // Only advertise locations we can actually deploy to (regions with a node).
    const regions = await this.prisma.region.findMany({
      where: { nodes: { some: { deletedAt: null } } },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, country: true },
    });

    return {
      game: { ...game, startingPrice: this.startingPrice(game.id, products) },
      plans,
      regions,
    };
  }

  // ---- helpers ------------------------------------------------------------

  private activeGameProducts(): Promise<PricedProduct[]> {
    return this.prisma.product.findMany({
      where: { isActive: true, type: 'GAME_SERVER' },
      include: {
        prices: { where: { isActive: true } },
        hardwareTiers: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { prices: { where: { isActive: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Every active price for a product: product-level + each active tier's. */
  private allPrices(p: PricedProduct) {
    return [
      ...(p.prices ?? []),
      ...(p.hardwareTiers ?? []).flatMap((t) => t.prices ?? []),
    ];
  }

  /** An empty whitelist means the product allows every game. */
  private productAllows(p: PricedProduct, templateId: string): boolean {
    return !p.allowedTemplateIds?.length || p.allowedTemplateIds.includes(templateId);
  }

  private startingPrice(
    templateId: string,
    products: PricedProduct[],
  ): StartingPrice | null {
    // The storefront shows this as a "from $X/mo", so compare MONTHLY prices only
    // — otherwise the cheapest interval (weekly) wins and gets mislabelled /mo.
    let best: StartingPrice | null = null;
    let anyBest: StartingPrice | null = null; // fallback if a product has no monthly
    for (const p of products) {
      if (!this.productAllows(p, templateId)) continue;
      for (const price of this.allPrices(p)) {
        if (!anyBest || price.amountMinor < anyBest.amountMinor) {
          anyBest = { amountMinor: price.amountMinor, currency: price.currency };
        }
        if (price.interval !== 'MONTHLY') continue;
        if (!best || price.amountMinor < best.amountMinor) {
          best = { amountMinor: price.amountMinor, currency: price.currency };
        }
      }
    }
    return best ?? anyBest;
  }

  /** Shape a product into the safe plan view used by the storefront. */
  private toPublicPlan(p: PricedProduct) {
    const mapPrices = (
      prices: { id: string; interval: string; currency: string; amountMinor: number }[],
    ) =>
      prices
        .map((pr) => ({
          id: pr.id,
          interval: pr.interval,
          currency: pr.currency,
          amountMinor: pr.amountMinor,
        }))
        .sort((a, b) => a.amountMinor - b.amountMinor);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      type: p.type,
      billingModel: p.billingModel,
      perSlot: p.perSlot,
      cpuCores: p.cpuCores,
      memoryMb: p.memoryMb,
      diskMb: p.diskMb,
      slots: p.slots,
      minSlots: p.minSlots,
      maxSlots: p.maxSlots,
      slotStep: p.slotStep,
      prices: mapPrices(p.prices ?? []),
      // Hardware tiers (Low/Mid/High) with their own per-interval prices.
      hardwareTiers: (p.hardwareTiers ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        cpuCores: t.cpuCores,
        memoryMb: t.memoryMb,
        diskMb: t.diskMb,
        recommendedPlayers: t.recommendedPlayers,
        isRecommended: t.isRecommended,
        sortOrder: t.sortOrder,
        prices: mapPrices(t.prices ?? []),
      })),
    };
  }
}
