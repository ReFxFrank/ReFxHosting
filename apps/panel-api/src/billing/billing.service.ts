import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  Invoice,
  InvoiceState,
  PaymentMethod,
  PaymentState,
  PendingPlanChange,
  PendingVanityAddress,
  Price,
  Prisma,
  Product,
  Subscription,
  SubscriptionState,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../platform/settings.service";
import {
  Paginated,
  PaginationDto,
  paginate,
} from "../common/dto/pagination.dto";
import { uuidv7 } from "../common/util/uuid";
import { AppConfig } from "../config/configuration";
import {
  JOB,
  QUEUE,
  SuspensionJob,
  SUSPENSION_JOB_OPTS,
  INSTALL_JOB_OPTS,
} from "../queues/queue.constants";
import { StripeGateway } from "./gateways/stripe.gateway";
import { PayPalGateway } from "./gateways/paypal.gateway";
import { EmailService } from "../email/email.service";
import { NotificationsService } from "../platform/notifications.service";
import { PushService } from "../push/push.service";
import { addInterval } from "./interval.util";
import {
  buildAllocationAlias,
  normalizeGameDomain,
} from "../servers/allocation-port.util";
import { generateInvoiceNumber } from "./invoice-number.util";
import { calculateTax } from "./tax.util";
import { CreateProductDto } from "./dto/create-product.dto";
import { CreatePriceDto } from "./dto/create-price.dto";
import {
  CreateHardwareTierDto,
  UpdateHardwareTierDto,
} from "./dto/hardware-tier.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { AddPaymentMethodDto } from "./dto/add-payment-method.dto";

/** Details needed to record a successful payment against an invoice. */
export interface MarkPaidDetails {
  gateway: string;
  gatewayRef: string;
  /** Amount captured in minor units; defaults to the invoice total. */
  amountMinor?: number;
  currency?: string;
  gatewayInvoiceId?: string;
}

/**
 * Months represented by one billing interval — used to scale per-month add-on
 * pricing (e.g. express backups) onto whatever cycle the plan bills at.
 * Mirrors the factors used by the revenue normalization in nodes.service.
 */
function intervalMonths(interval: string): number {
  switch (interval) {
    case 'WEEKLY':
      return 12 / 52;
    case 'BIWEEKLY':
      return 12 / 26;
    case 'MONTHLY':
      return 1;
    case 'QUARTERLY':
      return 3;
    case 'SEMIANNUAL':
      return 6;
    case 'ANNUAL':
      return 12;
    default:
      return 1;
  }
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly billingCfg: AppConfig["billing"];
  private readonly panelUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    @InjectQueue(QUEUE.BILLING_RENEWAL) private readonly renewalQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
    @InjectQueue(QUEUE.PROVISIONING) private readonly provisionQueue: Queue,
  ) {
    this.billingCfg = this.config.get<AppConfig["billing"]>("billing")!;
    this.panelUrl = this.config.get<AppConfig["panelUrl"]>("panelUrl")!;
  }

  // ---- Products & Prices -------------------------------------------------

  /**
   * Include shape for a product with its active hardware tiers (each with active
   * prices, ordered) plus active product-level prices — what the storefront and
   * order flow need to render either tier cards or a slot selector.
   */
  private static readonly productInclude = {
    prices: { where: { isActive: true } },
    hardwareTiers: {
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { prices: { where: { isActive: true } } },
    },
  } satisfies Prisma.ProductInclude;

  /** Admin include: every tier/price (active or not) for management screens. */
  private static readonly productAdminInclude = {
    prices: true,
    hardwareTiers: {
      orderBy: { sortOrder: "asc" },
      include: { prices: true },
    },
  } satisfies Prisma.ProductInclude;

  /**
   * Reconcile the billing model with the legacy `perSlot` flag so they never
   * drift: PER_SLOT ⟺ perSlot === true. Either field may be supplied; both are
   * written consistently.
   */
  private static resolveBillingModel(dto: {
    billingModel?: "HARDWARE_TIER" | "PER_SLOT";
    perSlot?: boolean;
  }): { billingModel: "HARDWARE_TIER" | "PER_SLOT"; perSlot: boolean } | null {
    if (dto.billingModel === undefined && dto.perSlot === undefined)
      return null;
    const perSlot =
      dto.billingModel !== undefined
        ? dto.billingModel === "PER_SLOT"
        : !!dto.perSlot;
    return { billingModel: perSlot ? "PER_SLOT" : "HARDWARE_TIER", perSlot };
  }

  /** List active products with their active prices + hardware tiers. */
  listProducts(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: BillingService.productInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  async getProduct(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: BillingService.productAdminInclude,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  /** Admin: create a product. */
  createProduct(dto: CreateProductDto): Promise<Product> {
    const model = BillingService.resolveBillingModel(dto);
    return this.prisma.product.create({
      data: {
        id: uuidv7(),
        type: dto.type,
        billingModel: model?.billingModel ?? "HARDWARE_TIER",
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        isActive: dto.isActive ?? true,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        slots: dto.slots,
        allowedTemplateIds: dto.allowedTemplateIds ?? [],
        perSlot: model?.perSlot ?? false,
        gameTemplateId: dto.gameTemplateId ?? null,
        minSlots: dto.minSlots ?? undefined,
        maxSlots: dto.maxSlots ?? undefined,
        slotStep: dto.slotStep ?? undefined,
        cpuPerSlot: dto.cpuPerSlot ?? undefined,
        memoryMbPerSlot: dto.memoryMbPerSlot ?? undefined,
        diskMbPerSlot: dto.diskMbPerSlot ?? undefined,
      },
    });
  }

  /** Admin: create a price for a product, or for one of its hardware tiers. */
  async createPrice(dto: CreatePriceDto) {
    // Ensure the product exists before attaching a price.
    await this.getProduct(dto.productId);
    const currency = dto.currency ?? this.billingCfg.defaultCurrency;
    if (dto.hardwareTierId) {
      // The tier must exist and belong to this product.
      const tier = await this.prisma.hardwareTier.findUnique({
        where: { id: dto.hardwareTierId },
        select: { productId: true },
      });
      if (!tier || tier.productId !== dto.productId) {
        throw new BadRequestException(
          "Hardware tier does not belong to product",
        );
      }
    } else {
      // SQL treats NULLs as distinct, so the unique index can't enforce a single
      // product-level price per interval/currency — guard it here.
      const dup = await this.prisma.price.findFirst({
        where: {
          productId: dto.productId,
          hardwareTierId: null,
          interval: dto.interval,
          currency,
        },
        select: { id: true },
      });
      if (dup) {
        throw new ConflictException(
          "A price for that interval and currency already exists — edit it instead.",
        );
      }
    }
    try {
      return await this.prisma.price.create({
        data: {
          id: uuidv7(),
          productId: dto.productId,
          hardwareTierId: dto.hardwareTierId ?? null,
          interval: dto.interval,
          currency,
          amountMinor: dto.amountMinor,
          stripePriceId: dto.stripePriceId,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          "A price for that interval and currency already exists — edit it instead.",
        );
      }
      throw e;
    }
  }

  /** Admin: update an existing price's mutable fields. */
  async updatePrice(id: string, dto: UpdatePriceDto): Promise<Price> {
    const price = await this.prisma.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException("Price not found");
    const data: Prisma.PriceUpdateInput = {};
    if (dto.interval !== undefined) data.interval = dto.interval;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.amountMinor !== undefined) data.amountMinor = dto.amountMinor;
    if (dto.stripePriceId !== undefined) data.stripePriceId = dto.stripePriceId;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    try {
      return await this.prisma.price.update({ where: { id }, data });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          "A price for that interval and currency already exists.",
        );
      }
      throw e;
    }
  }

  /** Admin: delete a price. */
  async deletePrice(id: string): Promise<{ id: string }> {
    const price = await this.prisma.price.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!price) throw new NotFoundException("Price not found");
    await this.prisma.price.delete({ where: { id } });
    return { id };
  }

  /** Admin: list all products (active and inactive) with prices + tiers. */
  listAllProducts(): Promise<Product[]> {
    return this.prisma.product.findMany({
      include: BillingService.productAdminInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  /** Admin: update a product's mutable fields. */
  async updateProduct(
    id: string,
    dto: Partial<CreateProductDto>,
  ): Promise<Product> {
    await this.getProduct(id);
    const data: Prisma.ProductUpdateInput = {};
    const model = BillingService.resolveBillingModel(dto);
    if (model) {
      data.billingModel = model.billingModel;
      data.perSlot = model.perSlot;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.cpuCores !== undefined) data.cpuCores = dto.cpuCores;
    if (dto.memoryMb !== undefined) data.memoryMb = dto.memoryMb;
    if (dto.diskMb !== undefined) data.diskMb = dto.diskMb;
    if (dto.slots !== undefined) data.slots = dto.slots;
    if (dto.allowedTemplateIds !== undefined) {
      data.allowedTemplateIds = dto.allowedTemplateIds;
    }
    // perSlot is reconciled with billingModel above (resolveBillingModel).
    if (dto.gameTemplateId !== undefined) {
      data.gameTemplate = dto.gameTemplateId
        ? { connect: { id: dto.gameTemplateId } }
        : { disconnect: true };
    }
    if (dto.minSlots !== undefined) data.minSlots = dto.minSlots;
    if (dto.maxSlots !== undefined) data.maxSlots = dto.maxSlots;
    if (dto.slotStep !== undefined) data.slotStep = dto.slotStep;
    if (dto.cpuPerSlot !== undefined) data.cpuPerSlot = dto.cpuPerSlot;
    if (dto.memoryMbPerSlot !== undefined)
      data.memoryMbPerSlot = dto.memoryMbPerSlot;
    if (dto.diskMbPerSlot !== undefined) data.diskMbPerSlot = dto.diskMbPerSlot;
    return this.prisma.product.update({ where: { id }, data });
  }

  /**
   * Admin: permanently delete a product (its prices cascade). Refuses when any
   * subscription references it — deleting would break billing history; deactivate
   * (isActive=false) those instead. Products with no subscriptions are removed
   * outright.
   */
  async deleteProduct(id: string): Promise<{ id: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, _count: { select: { subscriptions: true } } },
    });
    if (!product) throw new NotFoundException("Product not found");
    if (product._count.subscriptions > 0) {
      throw new BadRequestException(
        "This product has subscriptions and can’t be deleted without breaking billing history — deactivate it instead.",
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { id };
  }

  /** Public catalog: a single active product resolved by its slug. */
  async getActiveProductBySlug(slug: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: BillingService.productInclude,
    });
    if (!product) throw new NotFoundException("Product not found");
    return product;
  }

  // ---- Hardware tiers (game packages: Low/Mid/High) ----------------------

  /** Admin: add a hardware tier to a product. */
  async createTier(productId: string, dto: CreateHardwareTierDto) {
    await this.getProduct(productId);
    return this.prisma.hardwareTier.create({
      data: {
        id: uuidv7(),
        productId,
        name: dto.name,
        description: dto.description,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        recommendedPlayers: dto.recommendedPlayers ?? null,
        isRecommended: dto.isRecommended ?? false,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  /** Admin: edit a hardware tier. */
  async updateTier(tierId: string, dto: UpdateHardwareTierDto) {
    const tier = await this.prisma.hardwareTier.findUnique({
      where: { id: tierId },
      select: { id: true },
    });
    if (!tier) throw new NotFoundException("Hardware tier not found");
    const data: Prisma.HardwareTierUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.cpuCores !== undefined) data.cpuCores = dto.cpuCores;
    if (dto.memoryMb !== undefined) data.memoryMb = dto.memoryMb;
    if (dto.diskMb !== undefined) data.diskMb = dto.diskMb;
    if (dto.recommendedPlayers !== undefined) {
      data.recommendedPlayers = dto.recommendedPlayers;
    }
    if (dto.isRecommended !== undefined) data.isRecommended = dto.isRecommended;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return this.prisma.hardwareTier.update({ where: { id: tierId }, data });
  }

  /**
   * Admin: delete a hardware tier (its prices cascade). Refuses when a
   * subscription references it (billing history) — deactivate it instead.
   */
  async deleteTier(tierId: string): Promise<{ id: string }> {
    const tier = await this.prisma.hardwareTier.findUnique({
      where: { id: tierId },
      select: { id: true, _count: { select: { subscriptions: true } } },
    });
    if (!tier) throw new NotFoundException("Hardware tier not found");
    if (tier._count.subscriptions > 0) {
      throw new BadRequestException(
        "This tier has subscriptions and can’t be deleted — deactivate it instead.",
      );
    }
    await this.prisma.hardwareTier.delete({ where: { id: tierId } });
    return { id: tierId };
  }

  // ---- Subscriptions -----------------------------------------------------

  /** Start a subscription. Computes the first billing period from `interval`. */
  async createSubscription(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<Subscription> {
    const price = await this.prisma.price.findUnique({
      where: { id: dto.priceId },
    });
    if (!price || price.productId !== dto.productId) {
      throw new BadRequestException("Price does not belong to product");
    }
    if (price.interval !== dto.interval) {
      throw new BadRequestException(
        "Interval does not match the selected price",
      );
    }
    // The chosen price must match the chosen tier (or both be product-level).
    if ((price.hardwareTierId ?? null) !== (dto.hardwareTierId ?? null)) {
      throw new BadRequestException(
        "Price does not belong to the selected tier",
      );
    }

    const now = new Date();
    const currentPeriodEnd = addInterval(now, dto.interval);

    return this.prisma.subscription.create({
      data: {
        id: uuidv7(),
        userId,
        productId: dto.productId,
        priceId: dto.priceId,
        hardwareTierId: dto.hardwareTierId ?? null,
        interval: dto.interval,
        slots: dto.slots && dto.slots > 0 ? dto.slots : 1,
        expressBackups: dto.expressBackups ?? false,
        state: SubscriptionState.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        autoRenew: true,
        gateway: dto.gateway ?? "stripe",
      },
    });
  }

  async listSubscriptions(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      include: {
        product: { include: { prices: true } },
        hardwareTier: true,
        servers: {
          where: { deletedAt: null },
          select: { id: true, shortId: true, name: true, state: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    // Enrich with the recurring amount the customer will be billed at renewal
    // (per-slot rate × slots) + the linked server(s), without leaking the full
    // price table to the client.
    return subs.map((s) => {
      const price = s.product.prices.find((p) => p.id === s.priceId);
      const quantity = s.product.perSlot && s.slots > 0 ? s.slots : 1;
      return {
        id: s.id,
        productId: s.productId,
        priceId: s.priceId,
        interval: s.interval,
        slots: s.slots,
        state: s.state,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        autoRenew: s.autoRenew,
        gateway: s.gateway,
        createdAt: s.createdAt,
        product: {
          id: s.product.id,
          name: s.product.name,
          type: s.product.type,
          billingModel: s.product.billingModel,
          perSlot: s.product.perSlot,
        },
        hardwareTier: s.hardwareTier
          ? {
              id: s.hardwareTier.id,
              name: s.hardwareTier.name,
              cpuCores: s.hardwareTier.cpuCores,
              memoryMb: s.hardwareTier.memoryMb,
              diskMb: s.hardwareTier.diskMb,
            }
          : null,
        servers: s.servers,
        renewalAmountMinor: (price?.amountMinor ?? 0) * quantity,
        currency: price?.currency ?? this.billingCfg.defaultCurrency,
      };
    });
  }

  private async getOwnedSubscription(
    userId: string,
    id: string,
  ): Promise<Subscription> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    return sub;
  }

  /**
   * Cancel a subscription. `atPeriodEnd` schedules the cancellation for the end
   * of the current period (keeps service until then); otherwise cancel now.
   */
  async cancelSubscription(
    userId: string,
    id: string,
    atPeriodEnd: boolean,
  ): Promise<Subscription> {
    const sub = await this.getOwnedSubscription(userId, id);

    // Stop future PayPal auto-charges either way (immediate cancel, or cancel at
    // period end where service continues until currentPeriodEnd but PayPal must
    // not bill the next cycle). Best-effort: ignore PayPal errors (already gone).
    if (sub.gateway === "paypal" && sub.gatewaySubId) {
      try {
        await this.paypal.cancelSubscription(sub.gatewaySubId);
      } catch (e) {
        this.logger.warn(
          `PayPal cancel for ${sub.gatewaySubId} failed: ${(e as Error).message}`,
        );
      }
    }

    if (atPeriodEnd) {
      return this.prisma.subscription.update({
        where: { id },
        data: { cancelAtPeriodEnd: true, autoRenew: false },
      });
    }

    return this.prisma.subscription.update({
      where: { id },
      data: {
        state: SubscriptionState.CANCELED,
        cancelAtPeriodEnd: false,
        autoRenew: false,
        currentPeriodEnd: new Date(),
      },
    });
  }

  /**
   * Resume a subscription scheduled to cancel at period end: clear the flag and
   * re-enable auto-renew. Only valid while it is still in good standing.
   */
  async resumeSubscription(userId: string, id: string): Promise<Subscription> {
    const sub = await this.getOwnedSubscription(userId, id);
    if (
      sub.state === SubscriptionState.CANCELED ||
      sub.state === SubscriptionState.EXPIRED
    ) {
      throw new BadRequestException("Subscription cannot be resumed");
    }
    return this.prisma.subscription.update({
      where: { id },
      data: { cancelAtPeriodEnd: false, autoRenew: true },
    });
  }

  // ---- Invoices ----------------------------------------------------------

  async listInvoices(
    userId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<Invoice>> {
    const where: Prisma.InvoiceWhereInput = { userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { lineItems: true },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  // ---- admin (platform-wide, ADMIN/OWNER-gated by the controller) --------

  /** Selects a minimal, non-sensitive user shape for admin list joins. */
  private static readonly userSelect = {
    select: { id: true, email: true, firstName: true, lastName: true },
  };

  /** All invoices across the platform, with the owning customer. */
  async listAllInvoices(
    pagination: PaginationDto,
    state?: InvoiceState,
  ): Promise<Paginated<Invoice>> {
    const where: Prisma.InvoiceWhereInput = {};
    if (state && Object.values(InvoiceState).includes(state)) {
      where.state = state;
    }
    if (pagination.q) {
      where.OR = [
        { number: { contains: pagination.q, mode: "insensitive" } },
        { user: { email: { contains: pagination.q, mode: "insensitive" } } },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { user: BillingService.userSelect },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  /** All subscriptions ("orders") across the platform, with customer + product. */
  async listAllSubscriptions(
    pagination: PaginationDto,
  ): Promise<Paginated<Subscription>> {
    const where: Prisma.SubscriptionWhereInput = {};
    if (pagination.q) {
      where.OR = [
        { user: { email: { contains: pagination.q, mode: "insensitive" } } },
        { product: { name: { contains: pagination.q, mode: "insensitive" } } },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: {
          user: BillingService.userSelect,
          product: { select: { id: true, name: true, type: true } },
          _count: { select: { servers: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  /**
   * Delete an order (subscription). Invoice + (soft-deleted) server history is
   * preserved by detaching them rather than cascading. Refuses to delete an
   * order that still has live servers — those must be removed/transferred first.
   */
  async deleteSubscription(id: string): Promise<{ id: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        servers: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!sub) throw new NotFoundException("Order not found");
    if (sub.servers.length > 0) {
      throw new BadRequestException(
        "This order still has active servers — delete or transfer them before removing it.",
      );
    }
    await this.prisma.$transaction([
      // Detach already soft-deleted servers and keep invoice history intact.
      this.prisma.server.updateMany({
        where: { subscriptionId: id },
        data: { subscriptionId: null },
      }),
      this.prisma.invoice.updateMany({
        where: { subscriptionId: id },
        data: { subscriptionId: null },
      }),
      this.prisma.subscription.delete({ where: { id } }),
    ]);
    return { id };
  }

  /**
   * Bulk-delete orders. Each is attempted independently so one blocked order
   * (e.g. still has servers) doesn't abort the batch; the result reports which
   * were removed and which were skipped (with the reason).
   */
  async deleteSubscriptions(
    ids: string[],
  ): Promise<{ deleted: string[]; skipped: { id: string; reason: string }[] }> {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteSubscription(id);
        deleted.push(id);
      } catch (e) {
        skipped.push({ id, reason: (e as Error).message });
      }
    }
    return { deleted, skipped };
  }

  /** Headline billing figures for the admin Billing view (money in minor units). */
  async adminBillingSummary(): Promise<{
    currency: string;
    revenueMinor: number;
    outstandingMinor: number;
    activeSubscriptions: number;
    openInvoices: number;
    paidInvoices: number;
  }> {
    const [paid, open, activeSubscriptions, openInvoices, paidInvoices] =
      await this.prisma.$transaction([
        this.prisma.invoice.aggregate({
          _sum: { amountPaidMinor: true },
          where: { state: InvoiceState.PAID },
        }),
        this.prisma.invoice.aggregate({
          _sum: { totalMinor: true, amountPaidMinor: true },
          where: { state: InvoiceState.OPEN },
        }),
        this.prisma.subscription.count({
          where: { state: SubscriptionState.ACTIVE },
        }),
        this.prisma.invoice.count({ where: { state: InvoiceState.OPEN } }),
        this.prisma.invoice.count({ where: { state: InvoiceState.PAID } }),
      ]);
    return {
      currency: "USD",
      revenueMinor: paid._sum.amountPaidMinor ?? 0,
      outstandingMinor:
        (open._sum.totalMinor ?? 0) - (open._sum.amountPaidMinor ?? 0),
      activeSubscriptions,
      openInvoices,
      paidInvoices,
    };
  }

  /** All payments across the platform (OWNER-only view), with invoice + customer. */
  async listAllPayments(pagination: PaginationDto) {
    const where: Prisma.PaymentWhereInput = {};
    if (pagination.q) {
      where.OR = [
        {
          invoice: { number: { contains: pagination.q, mode: "insensitive" } },
        },
        {
          invoice: {
            user: { email: { contains: pagination.q, mode: "insensitive" } },
          },
        },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          gateway: true,
          amountMinor: true,
          currency: true,
          state: true,
          failureReason: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              number: true,
              user: BillingService.userSelect,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  /** Void (revoke) an invoice — marks it uncollectable without deleting history. */
  async voidInvoice(id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.state === InvoiceState.PAID) {
      throw new BadRequestException(
        "A paid invoice cannot be voided; issue a refund instead",
      );
    }
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { state: InvoiceState.VOID },
    });
    // Voiding an upgrade invoice abandons the staged change (the server stays on
    // its current plan); the customer can request the upgrade again later.
    await this.prisma.pendingPlanChange.deleteMany({
      where: { invoiceId: id },
    });
    // Likewise a voided vanity-address invoice releases the reserved name.
    await this.prisma.pendingVanityAddress.deleteMany({
      where: { invoiceId: id },
    });
    // Release any server reserved by this unpaid order so it disappears from the
    // customer's dashboard (it was never provisioned).
    if (invoice.subscriptionId) {
      await this.releaseUnpaidReservation(invoice.subscriptionId);
    }
    return updated;
  }

  /**
   * Manually settle an OPEN invoice (admin "mark as paid" — e.g. an off-platform
   * bank transfer). Runs the normal paid path, so the reserved server is
   * provisioned, the subscription reactivates and a receipt is sent.
   */
  async markInvoiceManuallyPaid(id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.state === InvoiceState.PAID) return invoice;
    if (invoice.state !== InvoiceState.OPEN) {
      throw new BadRequestException(`Invoice is ${invoice.state}, not payable`);
    }
    return this.markInvoicePaid(id, {
      gateway: "manual",
      gatewayRef: `manual-${id}`,
      amountMinor: Math.max(
        0,
        invoice.totalMinor - (invoice.amountPaidMinor ?? 0),
      ),
      currency: invoice.currency,
    });
  }

  /**
   * Soft-delete servers a subscription reserved but never paid for (state
   * PENDING_PAYMENT), freeing their allocations, and cancel the subscription if
   * nothing of it remains live. Used when an unpaid invoice is voided/deleted.
   */
  private async releaseUnpaidReservation(
    subscriptionId: string,
  ): Promise<void> {
    const pending = await this.prisma.server.findMany({
      where: { subscriptionId, deletedAt: null, state: "PENDING_PAYMENT" },
      select: { id: true },
    });
    for (const s of pending) {
      await this.prisma.$transaction([
        this.prisma.allocation.updateMany({
          where: { serverId: s.id },
          data: { serverId: null, isPrimary: false },
        }),
        this.prisma.server.update({
          where: { id: s.id },
          data: { deletedAt: new Date(), state: "OFFLINE" },
        }),
      ]);
    }
    // If the subscription now has no live servers and no settled invoice, cancel it.
    const [liveServers, paidInvoices] = await this.prisma.$transaction([
      this.prisma.server.count({ where: { subscriptionId, deletedAt: null } }),
      this.prisma.invoice.count({
        where: { subscriptionId, state: InvoiceState.PAID },
      }),
    ]);
    if (liveServers === 0 && paidInvoices === 0) {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          state: SubscriptionState.CANCELED,
          autoRenew: false,
          cancelAtPeriodEnd: false,
        },
      });
    }
  }

  /** Permanently delete an invoice (and its line items/payments via cascade). */
  async deleteInvoice(id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    // Deleting a PAID invoice removes a revenue record — allowed (the UI
    // confirms it), but we must NOT release/soft-delete the server it paid for.
    // Only an unpaid invoice releases its pending reservation.
    if (invoice.state !== InvoiceState.PAID && invoice.subscriptionId) {
      await this.releaseUnpaidReservation(invoice.subscriptionId);
    }
    await this.prisma.invoice.delete({ where: { id } });
  }

  /**
   * Bulk-delete invoices. Each is attempted independently so one failure doesn't
   * abort the batch; the result reports which were removed and which were skipped.
   */
  async deleteInvoices(
    ids: string[],
  ): Promise<{ deleted: string[]; skipped: { id: string; reason: string }[] }> {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await this.deleteInvoice(id);
        deleted.push(id);
      } catch (e) {
        skipped.push({ id, reason: (e as Error).message });
      }
    }
    return { deleted, skipped };
  }

  /** Whether each payment gateway is configured (no secrets returned). Reads the
   *  effective config (owner-edited DB settings → env fallback). */
  async gatewayStatus(): Promise<{
    stripe: { configured: boolean; publishableKey: string | null };
    paypal: { configured: boolean };
    expressBackups: { enabled: boolean; monthlyMinor: number };
  }> {
    const stripe = await this.settings.stripeConfig();
    const paypal = await this.settings.paypalConfig();
    const expressBackups = await this.settings.expressBackupsConfig();
    return {
      stripe: {
        configured: !!stripe.secretKey,
        // The publishable key is not a secret; safe to expose to the client.
        publishableKey: stripe.publishableKey || null,
      },
      paypal: { configured: !!paypal.clientId && !!paypal.clientSecret },
      // Public-safe add-on offer for the checkout page (price only, no secrets).
      expressBackups,
    };
  }

  async getInvoice(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: { lineItems: true, payments: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /**
   * Pay an OPEN invoice owned by the user. Charges the user's default payment
   * method through the gateway and marks the invoice paid on success; on failure
   * records a FAILED payment. Returns a (potentially) hosted checkout URL when no
   * stored method exists so the web can redirect.
   */
  async payInvoice(
    userId: string,
    id: string,
    gateway?: "stripe" | "paypal",
  ): Promise<{ paid: boolean; checkoutUrl?: string; reason?: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.state === InvoiceState.PAID) {
      return { paid: true };
    }
    if (invoice.state !== InvoiceState.OPEN) {
      throw new BadRequestException(`Invoice is ${invoice.state}, not payable`);
    }

    // If the balance is already fully covered (e.g. a 100%-off coupon, a gift
    // card, or store credit settled the whole amount), there is nothing for the
    // gateway to charge — settle it directly. Stripe/PayPal reject a zero (and
    // sub-minimum) amount, so handing a $0 balance to a hosted checkout would
    // 500 and break the flow. This runs before any gateway branch so it covers
    // both card and PayPal.
    const outstanding = invoice.totalMinor - (invoice.amountPaidMinor ?? 0);
    if (outstanding <= 0) {
      await this.markInvoicePaid(invoice.id, {
        gateway: "credit",
        gatewayRef: `comp-${invoice.id}`,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
      });
      return { paid: true };
    }

    // Hosted-checkout redirect targets — these are WEB routes (PANEL_URL).
    const successUrl = `${this.panelUrl}/billing?paid=1`;
    const cancelUrl = `${this.panelUrl}/billing`;

    // Explicit PayPal request → PayPal approval flow (when configured).
    if (gateway === "paypal") {
      const paypal = await this.settings.paypalConfig();
      if (!paypal.clientId || !paypal.clientSecret) {
        throw new BadRequestException("PayPal is not configured");
      }
      try {
        const session = await this.paypal.createCheckoutSession({
          invoice,
          successUrl,
          cancelUrl,
        });
        if (!session.url) {
          throw new Error("PayPal did not return an approval URL");
        }
        // Record the PayPal order id so capture can resolve the invoice by it
        // even if the capture response omits custom_id.
        if (session.sessionId) {
          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { gateway: "paypal", gatewayInvoiceId: session.sessionId },
          });
        }
        return { paid: false, checkoutUrl: session.url };
      } catch (e) {
        const detail = (e as Error).message ?? "unknown error";
        this.logger.error(`PayPal checkout failed: ${detail}`);
        // Surface PayPal's own reason (e.g. invalid_client = wrong keys/mode) so
        // the owner can fix it without digging through logs.
        throw new BadGatewayException(
          `Could not start PayPal checkout: ${detail}. Check the PayPal keys and sandbox/live mode in Payments settings.`,
        );
      }
    }

    return this.chargeOrCheckout(userId, invoice, successUrl, cancelUrl);
  }

  /**
   * Pay the open invoice for one of the caller's servers (used by the "Pay now"
   * button on an AWAITING_PAYMENT server). Resolves the server's subscription's
   * open invoice and starts the same payment flow as payInvoice.
   */
  async payForServer(
    userId: string,
    serverId: string,
    gateway?: "stripe" | "paypal",
  ): Promise<{ paid: boolean; checkoutUrl?: string; reason?: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, ownerId: userId, deletedAt: null },
      select: { subscriptionId: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (!server.subscriptionId) {
      throw new BadRequestException("This server has no invoice to pay");
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        subscriptionId: server.subscriptionId,
        state: InvoiceState.OPEN,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!invoice)
      throw new BadRequestException("No open invoice for this server");
    return this.payInvoice(userId, invoice.id, gateway);
  }

  /**
   * Complete a PayPal checkout after the buyer approves: capture the order (the
   * actual money movement) and mark the linked invoice paid. `orderId` is the
   * PayPal order token returned to the approval return URL.
   */
  async capturePayPal(
    userId: string,
    orderId: string,
  ): Promise<{ paid: boolean }> {
    let result;
    try {
      result = await this.paypal.captureOrder(orderId);
    } catch (e) {
      this.logger.error(`PayPal capture failed: ${(e as Error).message}`);
      throw new BadGatewayException(
        `PayPal capture failed: ${(e as Error).message}`,
      );
    }
    if (result.status !== "COMPLETED") {
      throw new BadRequestException(
        `PayPal payment not completed (status: ${result.status})`,
      );
    }
    // Resolve the invoice from the capture's custom_id; fall back to the PayPal
    // order id we stored on the invoice at checkout (so a missing custom_id never
    // strands a paid order).
    let invoice = result.invoiceId
      ? await this.prisma.invoice.findFirst({
          where: { id: result.invoiceId, userId },
          select: { id: true },
        })
      : null;
    if (!invoice) {
      invoice = await this.prisma.invoice.findFirst({
        where: { gatewayInvoiceId: orderId, userId },
        select: { id: true },
      });
    }
    if (!invoice) throw new NotFoundException("Invoice not found");

    await this.markInvoicePaid(invoice.id, {
      gateway: "paypal",
      gatewayRef: result.captureId ?? orderId,
      amountMinor: result.amountMinor,
      currency: result.currency,
    });
    return { paid: true };
  }

  // ---- Recurring PayPal subscriptions ------------------------------------

  /**
   * Ensure a PayPal billing plan exists for a price (creating the PayPal catalog
   * product + plan on first use and persisting their ids), and return the plan id.
   */
  async ensurePayPalPlan(priceId: string): Promise<string> {
    const price = await this.prisma.price.findUnique({
      where: { id: priceId },
      include: { product: true },
    });
    if (!price) throw new NotFoundException("Price not found");
    if (price.paypalPlanId) return price.paypalPlanId;

    let paypalProductId = price.product.paypalProductId;
    if (!paypalProductId) {
      paypalProductId = await this.paypal.createCatalogProduct(
        price.product.name,
        price.product.description ?? undefined,
      );
      await this.prisma.product.update({
        where: { id: price.product.id },
        data: { paypalProductId },
      });
    }

    const planId = await this.paypal.createBillingPlan({
      paypalProductId,
      name: `${price.product.name} (${price.interval.toLowerCase()})`,
      interval: price.interval,
      amountMinor: price.amountMinor,
      currency: price.currency,
    });
    await this.prisma.price.update({
      where: { id: price.id },
      data: { paypalPlanId: planId },
    });
    return planId;
  }

  /**
   * Start a recurring PayPal subscription for one of the caller's subscriptions
   * and return the approval URL. The first payment (and every renewal) settles
   * the period invoice + provisions via the PayPal webhook.
   */
  async startPayPalSubscription(
    userId: string,
    subscriptionId: string,
  ): Promise<{ approveUrl: string }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    const paypal = await this.settings.paypalConfig();
    if (!paypal.clientId || !paypal.clientSecret) {
      throw new BadRequestException("PayPal is not configured");
    }
    const planId = await this.ensurePayPalPlan(sub.priceId);
    const created = await this.paypal.createSubscription({
      planId,
      customId: sub.id,
      successUrl: `${this.panelUrl}/billing?paid=1`,
      cancelUrl: `${this.panelUrl}/billing`,
    });
    if (!created.approveUrl) {
      throw new BadGatewayException("PayPal did not return an approval URL");
    }
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { gateway: "paypal", gatewaySubId: created.id },
    });
    return { approveUrl: created.approveUrl };
  }

  /**
   * Settle a recurring PayPal payment (webhook PAYMENT.SALE.COMPLETED). Resolves
   * our subscription by the PayPal subscription id, settles the open period
   * invoice (raising one for a renewal), provisions on the first payment, and
   * rolls the billing period forward. Idempotent by the PayPal sale id.
   */
  async settlePayPalRecurringPayment(
    paypalSubId: string,
    details: { saleId: string; amountMinor?: number; currency?: string },
  ): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { gatewaySubId: paypalSubId },
    });
    if (!sub) {
      this.logger.warn(`PayPal sale for unknown subscription ${paypalSubId}`);
      return;
    }
    if (details.saleId) {
      const already = await this.prisma.payment.findFirst({
        where: { gatewayRef: details.saleId, state: PaymentState.SUCCEEDED },
        select: { id: true },
      });
      if (already) return; // duplicate delivery
    }

    // Settle the current OPEN invoice (first payment), else raise one for the
    // new period (a renewal PayPal initiated).
    const open = await this.prisma.invoice.findFirst({
      where: { subscriptionId: sub.id, state: InvoiceState.OPEN },
      orderBy: { createdAt: "desc" },
    });
    const isRenewal = !open;
    const invoice =
      open ??
      (await this.createInvoiceForSubscription(sub.id, { noTax: true }));

    await this.markInvoicePaid(invoice.id, {
      gateway: "paypal",
      gatewayRef: details.saleId,
      amountMinor: details.amountMinor ?? invoice.totalMinor,
      currency: details.currency ?? invoice.currency,
    });

    // Roll the period forward on a renewal (or if the current period has ended).
    const now = new Date();
    if (isRenewal || sub.currentPeriodEnd <= now) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          state: SubscriptionState.ACTIVE,
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addInterval(sub.currentPeriodEnd, sub.interval),
          renewalReminderSentAt: null,
        },
      });
    }
  }

  /**
   * Update our subscription state from a PayPal subscription lifecycle webhook
   * (cancelled/suspended/expired), resolving by the PayPal subscription id.
   */
  async applyPayPalSubscriptionState(
    paypalSubId: string,
    state: SubscriptionState,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: { gatewaySubId: paypalSubId },
    });
    if (!sub) return;
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        state,
        ...(state === SubscriptionState.CANCELED ? { autoRenew: false } : {}),
      },
    });
    if (
      state === SubscriptionState.CANCELED ||
      state === SubscriptionState.SUSPENDED
    ) {
      const servers = await this.prisma.server.findMany({
        where: { subscriptionId: sub.id, deletedAt: null },
        select: { id: true },
      });
      for (const s of servers) {
        await this.suspensionQueue.add(
          JOB.SUSPEND,
          {
            serverId: s.id,
            subscriptionId: sub.id,
            action: "suspend",
            reason: `PayPal subscription ${state.toLowerCase()}`,
          } satisfies SuspensionJob,
          SUSPENSION_JOB_OPTS,
        );
      }
    }
  }

  // ---- External webhook settlement (PayPal/Stripe async events) ----------

  /** Settle an invoice from an async gateway event (idempotent). */
  async settleExternalPayment(
    invoiceId: string,
    details: MarkPaidDetails,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!invoice) return; // unknown invoice — ignore
    await this.markInvoicePaid(invoiceId, details);
  }

  /** Record an async payment failure for an invoice. */
  async failExternalPayment(
    invoiceId: string,
    reason: string,
    details: { gateway?: string; gatewayRef?: string },
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!invoice) return;
    await this.handlePaymentFailure(invoiceId, reason, details);
  }

  /** Record a refund/reversal against an invoice (idempotent by gatewayRef). */
  async refundExternalPayment(
    invoiceId: string,
    details: {
      gateway: string;
      gatewayRef: string;
      amountMinor?: number;
      currency?: string;
    },
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;

    if (details.gatewayRef) {
      const existing = await this.prisma.payment.findFirst({
        where: {
          invoiceId,
          gatewayRef: details.gatewayRef,
          state: PaymentState.REFUNDED,
        },
        select: { id: true },
      });
      if (existing) return; // already recorded
    }

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          id: uuidv7(),
          invoiceId,
          gateway: details.gateway,
          gatewayRef: details.gatewayRef,
          amountMinor:
            details.amountMinor ??
            invoice.amountPaidMinor ??
            invoice.totalMinor,
          currency: details.currency ?? invoice.currency,
          state: PaymentState.REFUNDED,
        },
      }),
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { state: InvoiceState.REFUNDED },
      }),
    ]);
    this.logger.log(`Invoice ${invoiceId} refunded via ${details.gateway}`);
  }

  /**
   * Admin-initiated refund: refund a PAID invoice's settled payment back to the
   * original method via its gateway, then record a REFUNDED Payment. A full
   * refund moves the invoice to REFUNDED; a partial refund records the amount but
   * leaves the invoice PAID (there's no partial-refunded state). Does NOT touch
   * the subscription or servers — cancel/suspend those separately if intended.
   */
  async refundInvoice(
    invoiceId: string,
    amountMinor?: number,
    actorId?: string,
  ): Promise<{ refunded: boolean; amountMinor: number; full: boolean }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.state !== InvoiceState.PAID) {
      throw new BadRequestException("Only a PAID invoice can be refunded");
    }

    const charge = await this.prisma.payment.findFirst({
      where: { invoiceId, state: PaymentState.SUCCEEDED },
      orderBy: { createdAt: "desc" },
    });
    if (!charge || !charge.gatewayRef) {
      throw new BadRequestException(
        "No settled gateway payment found to refund (was it paid manually?)",
      );
    }

    const paidMinor = invoice.amountPaidMinor || invoice.totalMinor;
    const requested = amountMinor && amountMinor > 0 ? amountMinor : paidMinor;
    if (requested > paidMinor) {
      throw new BadRequestException(
        `Refund exceeds the amount paid (${paidMinor} ${invoice.currency})`,
      );
    }
    const full = requested >= paidMinor;

    const gateway =
      charge.gateway === this.paypal.name ? this.paypal : this.stripe;
    const { refundRef } = await gateway.refund(
      charge.gatewayRef,
      full ? undefined : requested,
      invoice.currency,
    );

    await this.prisma.$transaction([
      this.prisma.payment.create({
        data: {
          id: uuidv7(),
          invoiceId,
          gateway: charge.gateway,
          gatewayRef: refundRef,
          amountMinor: requested,
          currency: invoice.currency,
          state: PaymentState.REFUNDED,
        },
      }),
      ...(full
        ? [
            this.prisma.invoice.update({
              where: { id: invoiceId },
              data: { state: InvoiceState.REFUNDED },
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Invoice ${invoiceId} ${full ? "fully" : "partially"} refunded ` +
        `(${requested} ${invoice.currency}) via ${charge.gateway} by ${actorId ?? "system"}`,
    );
    return { refunded: true, amountMinor: requested, full };
  }

  /** Charge a saved default method, else hand off to a hosted Stripe checkout. */
  private async chargeOrCheckout(
    userId: string,
    invoice: Invoice,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ paid: boolean; checkoutUrl?: string; reason?: string }> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });
    if (!method) {
      // No saved method: hand off to a hosted Stripe checkout session.
      const session = await this.stripe.createCheckoutSession({
        invoice,
        successUrl,
        cancelUrl,
      });
      return { paid: false, checkoutUrl: session.url };
    }

    const customerId = await this.getGatewayCustomerId(userId);
    const chargedMinor = Math.max(
      0,
      invoice.totalMinor - (invoice.amountPaidMinor ?? 0),
    );
    const result = await this.stripe.charge(
      invoice,
      method.gatewayRef,
      customerId,
    );
    if (result.success) {
      await this.markInvoicePaid(invoice.id, {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
        amountMinor: chargedMinor,
        currency: invoice.currency,
      });
      return { paid: true };
    }
    await this.handlePaymentFailure(
      invoice.id,
      result.failureReason ?? "charge failed",
      {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
      },
    );
    return { paid: false, reason: result.failureReason };
  }

  /**
   * Resolve an invoice from a processor reference (used by webhooks). By default
   * looks up by `gatewayInvoiceId`; pass `byInternalId` to look up by our own id.
   */
  async getInvoiceByGatewayId(
    ref: string,
    opts: { byInternalId?: boolean } = {},
  ): Promise<Invoice> {
    const invoice = opts.byInternalId
      ? await this.prisma.invoice.findUnique({ where: { id: ref } })
      : await this.prisma.invoice.findFirst({
          where: { gatewayInvoiceId: ref },
        });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  /**
   * Build a draft (OPEN) invoice for a subscription's current period: one line
   * item from the product/price, tax via the tax engine, and a year-scoped
   * invoice number.
   */
  /**
   * Raise a one-off OPEN invoice for a plan UPGRADE — typically the prorated
   * price difference for the remainder of the current period. Taxed from the
   * customer's billing address like any other invoice. The staged plan change is
   * applied to the server only once this invoice is PAID (markInvoicePaid →
   * applyPendingPlanChange), so the customer keeps their old configuration until
   * payment clears.
   */
  async createUpgradeInvoice(
    subscriptionId: string,
    args: { amountMinor: number; description: string },
  ): Promise<Invoice> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: true },
    });
    if (!subscription) throw new NotFoundException("Subscription not found");
    const price = await this.prisma.price.findUnique({
      where: { id: subscription.priceId },
      select: { currency: true },
    });
    const currency = price?.currency || this.billingCfg.defaultCurrency;

    const subtotalMinor = Math.max(0, Math.round(args.amountMinor));
    const taxLoc = this.resolveTaxRegion(subscription.user);
    const tax = calculateTax(subtotalMinor, {
      region: taxLoc?.region ?? "",
      country: taxLoc?.country,
    });
    const totalMinor = subtotalMinor + tax.taxMinor;

    const year = new Date().getUTCFullYear();
    const sequence = await this.nextInvoiceSequence(year);
    const number = generateInvoiceNumber(
      this.billingCfg.invoiceNumberPrefix,
      year,
      sequence,
    );

    const invoice = await this.prisma.invoice.create({
      data: {
        id: uuidv7(),
        number,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        state: InvoiceState.OPEN,
        currency,
        subtotalMinor,
        discountMinor: 0,
        taxMinor: tax.taxMinor,
        totalMinor,
        amountPaidMinor: 0,
        taxType: tax.taxType ?? undefined,
        taxRatePct: tax.taxRatePct || undefined,
        taxRegion: taxLoc?.region ?? undefined,
        gateway: subscription.gateway,
        dueAt: new Date(),
        lineItems: {
          create: [
            {
              id: uuidv7(),
              description: args.description,
              quantity: 1,
              unitMinor: subtotalMinor,
              amountMinor: subtotalMinor,
            },
          ],
        },
      },
      include: { lineItems: true },
    });

    // Tell the customer to pay so the upgrade actually applies (best-effort).
    try {
      const amount = `${(totalMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
      await this.notifications.createNotification(subscription.userId, {
        title: "Pay to complete your upgrade",
        body: `Invoice ${number} for ${amount} is ready. Your plan upgrade applies once it's paid.`,
      });
      await this.push.sendToUser(subscription.userId, {
        title: "Pay to complete your upgrade",
        body: `Invoice ${number} — ${amount} due. Your upgrade applies once paid.`,
        type: "billing.invoice",
        data: { invoiceId: invoice.id },
      });
    } catch {
      // best-effort
    }

    return invoice;
  }

  /**
   * Apply a staged plan change to the live subscription + server, push the new
   * limits to the node agent (no reinstall), and clear the pending row. Called
   * when an upgrade invoice is paid, or at renewal for a scheduled downgrade.
   */
  async applyPendingPlanChange(pending: PendingPlanChange): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { subscriptionId: pending.subscriptionId, deletedAt: null },
      select: { id: true },
    });
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: pending.subscriptionId },
        data: {
          priceId: pending.priceId,
          hardwareTierId: pending.hardwareTierId,
          slots: pending.slots,
        },
      }),
      ...(server
        ? [
            this.prisma.server.update({
              where: { id: server.id },
              data: {
                cpuCores: pending.cpuCores,
                memoryMb: pending.memoryMb,
                diskMb: pending.diskMb,
                slots: pending.slots,
              },
            }),
          ]
        : []),
      // deleteMany (not delete) so a concurrent second apply — e.g. two webhook
      // deliveries racing — is a clean no-op instead of throwing P2025.
      this.prisma.pendingPlanChange.deleteMany({ where: { id: pending.id } }),
    ]);
    // Push the new limits to the node agent live. Best-effort: a failed enqueue
    // must not roll back the (already-committed) change or 500 the payment
    // webhook — the limits still take effect on the next restart/resize.
    if (server) {
      try {
        await this.provisionQueue.add(JOB.RECONFIGURE, { serverId: server.id });
      } catch (err) {
        this.logger.error(
          `failed to enqueue RECONFIGURE for server ${server.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Apply a PAID custom-address purchase: set the server's vanityLabel and
   * rewrite the advertised allocation aliases in place. Alias is panel-side
   * display only (the node binds 0.0.0.0 and wildcard DNS resolves any label),
   * so no agent call is needed. deleteMany keeps racing webhook deliveries
   * no-ops, mirroring applyPendingPlanChange.
   */
  async applyPendingVanityAddress(
    pending: PendingVanityAddress,
  ): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id: pending.serverId, deletedAt: null },
      select: {
        id: true,
        ownerId: true,
        node: { select: { gameDomain: true } },
      },
    });
    if (!server) {
      // Server deleted while the invoice was open — just release the name.
      await this.prisma.pendingVanityAddress.deleteMany({
        where: { id: pending.id },
      });
      return;
    }
    const gameDomain = normalizeGameDomain(server.node?.gameDomain);
    const alias = buildAllocationAlias(pending.label, gameDomain);
    try {
      await this.prisma.$transaction([
        this.prisma.server.update({
          where: { id: server.id },
          data: { vanityLabel: pending.label },
        }),
        ...(alias
          ? [
              this.prisma.allocation.updateMany({
                where: { serverId: server.id, alias: { not: null } },
                data: { alias },
              }),
            ]
          : []),
        this.prisma.pendingVanityAddress.deleteMany({
          where: { id: pending.id },
        }),
      ]);
    } catch (err) {
      // Near-impossible (the pending row held the unique reservation), but if
      // the label was snatched, don't fail the payment — release and tell them.
      this.logger.error(
        `apply vanity address failed for server ${server.id}: ${(err as Error).message}`,
      );
      await this.prisma.pendingVanityAddress
        .deleteMany({ where: { id: pending.id } })
        .catch(() => undefined);
      await this.notifications
        .createNotification(server.ownerId, {
          title: "Custom address could not be applied",
          body: `We couldn't apply "${pending.label}" to your server — please contact support for a credit.`,
        })
        .catch(() => undefined);
      return;
    }
    await this.notifications
      .createNotification(server.ownerId, {
        title: "Custom server address active",
        body: alias
          ? `Your server address is now ${alias}.`
          : `Your custom name "${pending.label}" was saved.`,
      })
      .catch(() => undefined);
  }

  async createInvoiceForSubscription(
    subscriptionId: string,
    opts: { discountMinor?: number; couponCode?: string; noTax?: boolean } = {},
  ): Promise<Invoice> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { product: true, user: true, hardwareTier: true },
    });
    if (!subscription) throw new NotFoundException("Subscription not found");

    const price = await this.prisma.price.findUnique({
      where: { id: subscription.priceId },
    });
    if (!price) throw new NotFoundException("Price not found for subscription");

    const currency = price.currency || this.billingCfg.defaultCurrency;
    // Per-slot products bill price-per-slot × slots; others are a single unit.
    const quantity =
      subscription.product.perSlot && subscription.slots > 0
        ? subscription.slots
        : 1;
    const unitMinor = price.amountMinor;
    // Express-backups add-on: a per-cycle line on top of the plan, scaled from
    // the admin-configured monthly fee to the subscription's interval. Charged
    // for as long as the subscription carries the flag.
    let addonMinor = 0;
    let addonLabel = '';
    if (subscription.expressBackups) {
      const cfg = await this.settings.expressBackupsConfig();
      if (cfg.monthlyMinor > 0) {
        addonMinor = Math.round(
          cfg.monthlyMinor * intervalMonths(subscription.interval),
        );
        addonLabel = 'Express backups — offsite storage & fast downloads';
      }
    }
    const subtotalMinor = unitMinor * quantity + addonMinor;
    // Coupon discount reduces the taxable base; never exceeds the subtotal.
    const discountMinor = Math.max(
      0,
      Math.min(opts.discountMinor ?? 0, subtotalMinor),
    );
    const taxableMinor = subtotalMinor - discountMinor;

    // Tax from the customer's saved billing address (no-tax when none on file).
    // PayPal-subscription invoices are raised tax-free: the PayPal plan price is
    // the total PayPal charges (per-customer tax can't be encoded in a shared
    // plan), so the invoice must match it.
    const taxLoc = opts.noTax ? null : this.resolveTaxRegion(subscription.user);
    const tax = opts.noTax
      ? { taxMinor: 0, taxType: null as string | null, taxRatePct: 0 }
      : calculateTax(taxableMinor, {
          region: taxLoc?.region ?? "",
          country: taxLoc?.country,
        });
    const totalMinor = taxableMinor + tax.taxMinor;
    const taxRegion = taxLoc?.region ?? null;

    const year = new Date().getUTCFullYear();
    const sequence = await this.nextInvoiceSequence(year);
    const number = generateInvoiceNumber(
      this.billingCfg.invoiceNumberPrefix,
      year,
      sequence,
    );

    const invoiceId = uuidv7();
    const invoice = await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        number,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        state: InvoiceState.OPEN,
        currency,
        subtotalMinor,
        discountMinor,
        couponCode: opts.couponCode ?? undefined,
        taxMinor: tax.taxMinor,
        totalMinor,
        amountPaidMinor: 0,
        taxType: tax.taxType ?? undefined,
        taxRatePct: tax.taxRatePct || undefined,
        taxRegion: taxRegion ?? undefined,
        gateway: subscription.gateway,
        dueAt: subscription.currentPeriodEnd,
        lineItems: {
          create: [
            {
              id: uuidv7(),
              // Reflect the exact purchase: tier name for game orders, slot count
              // for voice orders.
              description: this.invoiceLineDescription(subscription, quantity),
              quantity,
              unitMinor,
              amountMinor: unitMinor * quantity,
            },
            ...(addonMinor > 0
              ? [
                  {
                    id: uuidv7(),
                    description: addonLabel,
                    quantity: 1,
                    unitMinor: addonMinor,
                    amountMinor: addonMinor,
                  },
                ]
              : []),
          ],
        },
      },
      include: { lineItems: true },
    });

    // Notify the customer that a new invoice is available to pay (best-effort;
    // must never break invoice generation).
    try {
      const amount = `${(totalMinor / 100).toFixed(2)} ${currency.toUpperCase()}`;
      const due = invoice.dueAt
        ? `, due ${invoice.dueAt.toISOString().slice(0, 10)}`
        : "";
      await this.notifications.createNotification(subscription.userId, {
        title: "New invoice available",
        body: `Invoice ${number} for ${amount} is ready to pay${due}.`,
      });
      await this.push.sendToUser(subscription.userId, {
        title: "New invoice available",
        body: `Invoice ${number} — ${amount} due${due}.`,
        type: "billing.invoice",
        data: { invoiceId: invoice.id },
      });
    } catch {
      // best-effort
    }

    return invoice;
  }

  /** Human invoice line for a subscription: includes tier / slot count. */
  private invoiceLineDescription(
    subscription: Subscription & {
      product: Product;
      hardwareTier?: { name: string } | null;
    },
    quantity: number,
  ): string {
    const interval = subscription.interval.toLowerCase();
    if (subscription.hardwareTier) {
      return `${subscription.product.name} — ${subscription.hardwareTier.name} (${interval})`;
    }
    if (subscription.product.perSlot) {
      return `${subscription.product.name} — ${quantity} slots (${interval})`;
    }
    return `${subscription.product.name} (${interval})`;
  }

  /**
   * Compute the next 1-based invoice sequence for a calendar year (count of
   * invoices created this year + 1).
   */
  private async nextInvoiceSequence(year: number): Promise<number> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const count = await this.prisma.invoice.count({
      where: { createdAt: { gte: start, lt: end } },
    });
    return count + 1;
  }

  /**
   * Resolve the tax region from the customer's saved billing address. For US
   * customers the region is the two-letter state (tax engine keys US sales tax by
   * state); everywhere else it's the ISO country code (VAT/GST). Returns nulls
   * when no address is on file, which the tax engine treats as no-tax.
   */
  private resolveTaxRegion(
    user: {
      country: string | null;
      region: string | null;
    } | null,
  ): { region: string; country?: string } | null {
    if (!user?.country) return null;
    const country = user.country.toUpperCase();
    if (country === "US") {
      if (!user.region) return null; // need the state to rate US sales tax
      return { region: user.region.toUpperCase(), country };
    }
    return { region: country, country };
  }

  /** Mark an invoice PAID and record a SUCCEEDED Payment. */
  async markInvoicePaid(
    invoiceId: string,
    details: MarkPaidDetails,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    // Idempotency: Stripe emits several overlapping events for one payment
    // (invoice.paid + invoice.payment_succeeded + payment_intent.succeeded) and
    // retries delivery. If we've already recorded this exact gateway payment —
    // or the invoice is already settled and we have no new ref — do nothing, so
    // we never double-count revenue or create duplicate Payment rows.
    if (details.gatewayRef) {
      const already = await this.prisma.payment.findFirst({
        where: {
          invoiceId,
          gatewayRef: details.gatewayRef,
          state: PaymentState.SUCCEEDED,
        },
        select: { id: true },
      });
      if (already) return invoice;
    } else if (invoice.state === InvoiceState.PAID) {
      return invoice;
    }

    const amountMinor = details.amountMinor ?? invoice.totalMinor;
    const currency = details.currency ?? invoice.currency;

    const [updated] = await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          state: InvoiceState.PAID,
          // PAID means fully settled — record the full total (a gift-card credit
          // may have already covered part, with the gateway charging the rest).
          amountPaidMinor: invoice.totalMinor,
          paidAt: new Date(),
          gateway: details.gateway,
          gatewayInvoiceId:
            details.gatewayInvoiceId ?? invoice.gatewayInvoiceId,
        },
      }),
      this.prisma.payment.create({
        data: {
          id: uuidv7(),
          invoiceId,
          gateway: details.gateway,
          gatewayRef: details.gatewayRef,
          amountMinor,
          currency,
          state: PaymentState.SUCCEEDED,
        },
      }),
    ]);

    // If the invoice belongs to a subscription, (a) reactivate a past-due sub and
    // lift suspensions, and (b) provision any servers that were reserved pending
    // this first payment — so installation only begins once money has cleared.
    if (invoice.subscriptionId) {
      await this.reactivateOnPayment(invoice.subscriptionId);
      await this.provisionPaidServers(invoice.subscriptionId);
    }

    // Apply a paid plan UPGRADE — but ONLY on the real OPEN→PAID transition
    // (invoice.state is the pre-update snapshot), so a re-delivered webhook for
    // an already-paid invoice can't re-apply the change.
    if (invoice.state !== InvoiceState.PAID) {
      const paidUpgrade = await this.prisma.pendingPlanChange.findUnique({
        where: { invoiceId },
      });
      if (paidUpgrade) {
        await this.applyPendingPlanChange(paidUpgrade);
      }
      // A paid vanity-address purchase applies the same way: only on the real
      // OPEN→PAID transition, so webhook re-deliveries can't re-apply it.
      const paidVanity = await this.prisma.pendingVanityAddress.findUnique({
        where: { invoiceId },
      });
      if (paidVanity) {
        await this.applyPendingVanityAddress(paidVanity);
      }
    }

    // Email a receipt (best-effort; never blocks settlement).
    const recipient = await this.invoiceRecipient(invoice.userId);
    if (recipient) {
      await this.email.sendPaymentReceipt(recipient, {
        number: invoice.number,
        amountMinor,
        currency,
      });
    }

    return updated;
  }

  /** Resolve the billing email recipient for an invoice's owner. */
  private async invoiceRecipient(
    userId: string,
  ): Promise<{ email: string; firstName: string | null } | null> {
    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { email: true, firstName: true },
      })
      .catch(() => null);
    return user ?? null;
  }

  /**
   * Install servers that were created in PENDING_PAYMENT for this subscription:
   * flip them to INSTALLING and enqueue provisioning. This is the gate that
   * ensures a customer's server only installs after payment has cleared.
   */
  private async provisionPaidServers(subscriptionId: string): Promise<void> {
    const pending = await this.prisma.server.findMany({
      where: { subscriptionId, deletedAt: null, state: "PENDING_PAYMENT" },
      select: { id: true },
    });
    for (const s of pending) {
      await this.prisma.server.update({
        where: { id: s.id },
        data: { state: "INSTALLING" },
      });
      await this.provisionQueue.add(
        JOB.PROVISION,
        { serverId: s.id },
        INSTALL_JOB_OPTS,
      );
    }
  }

  private async reactivateOnPayment(subscriptionId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub || sub.state === SubscriptionState.CANCELED) return;
    if (
      sub.state === SubscriptionState.PAST_DUE ||
      sub.state === SubscriptionState.SUSPENDED
    ) {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { state: SubscriptionState.ACTIVE },
      });
      const job: SuspensionJob = {
        subscriptionId,
        action: "unsuspend",
        reason: "invoice paid",
      };
      await this.suspensionQueue.add(JOB.SUSPEND, job, SUSPENSION_JOB_OPTS);
    }
  }

  /**
   * Record a FAILED payment, move the subscription to PAST_DUE and enqueue a
   * suspension job for each related server (dunning is driven by the processor).
   */
  async handlePaymentFailure(
    invoiceId: string,
    reason: string,
    details?: { gateway?: string; gatewayRef?: string },
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: { include: { servers: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    await this.prisma.payment.create({
      data: {
        id: uuidv7(),
        invoiceId,
        gateway: details?.gateway ?? invoice.gateway ?? "unknown",
        gatewayRef: details?.gatewayRef ?? "",
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        state: PaymentState.FAILED,
        failureReason: reason,
      },
    });

    // Notify the customer (best-effort).
    const recipient = await this.invoiceRecipient(invoice.userId);
    if (recipient) {
      await this.email.sendPaymentFailed(recipient, {
        number: invoice.number,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        reason,
      });
    }
    try {
      const amount = `${(invoice.totalMinor / 100).toFixed(2)} ${invoice.currency.toUpperCase()}`;
      await this.push.sendToUser(invoice.userId, {
        title: "Payment failed",
        body: `Payment for invoice ${invoice.number} (${amount}) failed. Update your payment method to avoid suspension.`,
        type: "billing.invoice",
        data: { invoiceId: invoice.id },
      });
    } catch {
      // best-effort; never break the failure-handling path
    }

    const subscription = invoice.subscription;
    if (!subscription) {
      this.logger.warn(
        `Payment failure on invoice ${invoiceId} with no subscription; skipping suspension.`,
      );
      return;
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { state: SubscriptionState.PAST_DUE },
    });

    // Enqueue a suspend job per server tied to the subscription.
    for (const server of subscription.servers) {
      const job: SuspensionJob = {
        serverId: server.id,
        subscriptionId: subscription.id,
        action: "suspend",
        reason: `payment failed: ${reason}`,
      };
      await this.suspensionQueue.add(JOB.SUSPEND, job, SUSPENSION_JOB_OPTS);
    }
  }

  // ---- Payment methods ---------------------------------------------------

  async addPaymentMethod(
    userId: string,
    dto: AddPaymentMethodDto,
  ): Promise<PaymentMethod> {
    // If this is to be the default, clear the flag on existing methods first.
    if (dto.isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.paymentMethod.create({
      data: {
        id: uuidv7(),
        userId,
        gateway: dto.gateway,
        gatewayRef: dto.gatewayRef,
        brand: dto.brand,
        last4: dto.last4,
        expMonth: dto.expMonth,
        expYear: dto.expYear,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  listPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    return this.prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  private async getOwnedPaymentMethod(
    userId: string,
    id: string,
  ): Promise<PaymentMethod> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, userId },
    });
    if (!method) throw new NotFoundException("Payment method not found");
    return method;
  }

  /** Remove a stored payment method owned by the user (detaches it at Stripe). */
  async removePaymentMethod(userId: string, id: string): Promise<void> {
    const method = await this.getOwnedPaymentMethod(userId, id);
    if (method.gateway === this.stripe.name && method.gatewayRef) {
      await this.stripe.detachPaymentMethod(method.gatewayRef);
    }
    await this.prisma.paymentMethod.delete({ where: { id } });
    // If we removed the default, promote the most recent remaining method.
    if (method.isDefault) {
      const next = await this.prisma.paymentMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      if (next) {
        await this.prisma.paymentMethod.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  /** Mark a payment method as the user's default (clears the flag on others). */
  async setDefaultPaymentMethod(
    userId: string,
    id: string,
  ): Promise<PaymentMethod> {
    await this.getOwnedPaymentMethod(userId, id);
    await this.prisma.$transaction([
      this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.paymentMethod.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    return this.getOwnedPaymentMethod(userId, id);
  }

  /**
   * Ensure the user has a gateway (Stripe) customer and return its id, creating
   * + persisting one on first use. Required to save and off-session-charge cards.
   */
  private async ensureGatewayCustomer(userId: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        gatewayCustomerId: true,
      },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.gatewayCustomerId) return user.gatewayCustomerId;

    const customerId = await this.stripe.createCustomer({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { gatewayCustomerId: customerId },
    });
    return customerId;
  }

  /** The user's existing gateway customer id (undefined if none yet). */
  private async getGatewayCustomerId(
    userId: string,
  ): Promise<string | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gatewayCustomerId: true },
    });
    return user?.gatewayCustomerId ?? undefined;
  }

  /**
   * Begin adding a card: create a Stripe SetupIntent for the user's customer and
   * return its client_secret for the browser's Stripe Elements to confirm.
   */
  async createSetupIntent(
    userId: string,
  ): Promise<{ clientSecret: string; setupIntentId: string }> {
    const customerId = await this.ensureGatewayCustomer(userId);
    return this.stripe.createSetupIntent(customerId);
  }

  /**
   * Persist the card saved by a confirmed SetupIntent. Verifies the SetupIntent
   * (server-side) belongs to this user's customer, then upserts the
   * PaymentMethod (idempotent by gatewayRef) and makes it default if it's the
   * user's first.
   */
  async savePaymentMethodFromSetup(
    userId: string,
    setupIntentId: string,
  ): Promise<PaymentMethod> {
    const customerId = await this.ensureGatewayCustomer(userId);
    const saved = await this.stripe.getSavedPaymentMethod(setupIntentId);
    if (!saved || !saved.paymentMethodId) {
      throw new BadRequestException("Card setup is not complete yet");
    }
    if (saved.customerId && saved.customerId !== customerId) {
      throw new BadRequestException("Setup does not belong to this account");
    }

    const existing = await this.prisma.paymentMethod.findFirst({
      where: { userId, gatewayRef: saved.paymentMethodId },
    });
    if (existing) return existing;

    const count = await this.prisma.paymentMethod.count({ where: { userId } });
    const isDefault = count === 0;
    if (isDefault) {
      await this.prisma.paymentMethod.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.paymentMethod.create({
      data: {
        id: uuidv7(),
        userId,
        gateway: this.stripe.name,
        gatewayRef: saved.paymentMethodId,
        brand: saved.brand,
        last4: saved.last4,
        expMonth: saved.expMonth,
        expYear: saved.expYear,
        isDefault,
      },
    });
  }

  // ---- Renewal & dunning (driven by the billing-renewal queue) -----------

  /**
   * Subscriptions in good standing whose current period has ended (or ends
   * within `withinMs`) and that auto-renew — i.e. due for a fresh renewal. The
   * scheduler enqueues a RENEW job per id. PAST_DUE subs are NOT included here;
   * they're retried by the dunning sweep (`findPastDueSubscriptions`).
   */
  async findDueSubscriptions(withinMs = 0): Promise<string[]> {
    const cutoff = new Date(Date.now() + withinMs);
    const subs = await this.prisma.subscription.findMany({
      where: {
        autoRenew: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: cutoff },
        state: { in: [SubscriptionState.ACTIVE, SubscriptionState.TRIALING] },
      },
      select: { id: true },
    });
    return subs.map((s) => s.id);
  }

  /**
   * Email a proactive "your subscription renews on …" reminder for subscriptions
   * whose period ends within `withinDays`, once per period. Claims each
   * atomically (guarded update of `renewalReminderSentAt`) before sending, so
   * concurrent schedulers don't double-send. Returns the count sent.
   */
  async sendRenewalReminders(withinDays = 3): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + withinDays * 86_400_000);
    const subs = await this.prisma.subscription.findMany({
      where: {
        autoRenew: true,
        cancelAtPeriodEnd: false,
        state: { in: [SubscriptionState.ACTIVE, SubscriptionState.TRIALING] },
        currentPeriodEnd: { gt: now, lte: cutoff },
      },
      include: { user: true, product: true },
    });

    let sent = 0;
    for (const sub of subs) {
      // Claim the reminder for THIS period (not yet reminded since it started).
      const claimed = await this.prisma.subscription.updateMany({
        where: {
          id: sub.id,
          OR: [
            { renewalReminderSentAt: null },
            { renewalReminderSentAt: { lt: sub.currentPeriodStart } },
          ],
        },
        data: { renewalReminderSentAt: new Date() },
      });
      if (claimed.count === 0) continue; // another run already sent it
      if (!sub.user?.email) continue;

      const price = await this.prisma.price.findUnique({
        where: { id: sub.priceId },
        select: { amountMinor: true, currency: true },
      });
      const quantity = sub.product.perSlot && sub.slots > 0 ? sub.slots : 1;
      const hasPaymentMethod =
        (await this.prisma.paymentMethod.count({
          where: { userId: sub.userId, isDefault: true },
        })) > 0;

      await this.email.sendRenewalReminder(
        { email: sub.user.email, firstName: sub.user.firstName },
        {
          productName: sub.product.name,
          amountMinor: (price?.amountMinor ?? 0) * quantity,
          currency: price?.currency ?? this.billingCfg.defaultCurrency,
          renewsAt: sub.currentPeriodEnd,
          hasPaymentMethod,
        },
      );
      sent += 1;
    }
    return sent;
  }

  /** Email owners of default cards expiring this calendar month. */
  async sendCardExpiryReminders(): Promise<number> {
    const now = new Date();
    const cards = await this.prisma.paymentMethod.findMany({
      where: {
        isDefault: true,
        expYear: now.getUTCFullYear(),
        expMonth: now.getUTCMonth() + 1,
      },
      include: { user: true },
    });
    let sent = 0;
    for (const c of cards) {
      if (!c.user?.email || !c.expMonth || !c.expYear) continue;
      await this.email.sendCardExpiring(
        { email: c.user.email, firstName: c.user.firstName },
        {
          brand: c.brand,
          last4: c.last4,
          expMonth: c.expMonth,
          expYear: c.expYear,
        },
      );
      sent += 1;
    }
    return sent;
  }

  /**
   * Past-due subscriptions to retry (dunning). Auto-renewing, not scheduled to
   * cancel, still PAST_DUE — each has an unpaid OPEN invoice the renew path
   * reuses (it never creates a second invoice for the same period).
   */
  async findPastDueSubscriptions(): Promise<string[]> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        autoRenew: true,
        cancelAtPeriodEnd: false,
        state: SubscriptionState.PAST_DUE,
      },
      select: { id: true },
    });
    return subs.map((s) => s.id);
  }

  /**
   * Renew one subscription: generate the period invoice, charge the default
   * payment method via the gateway, then either mark paid + roll the period
   * forward, or record the failure (which moves it PAST_DUE and queues
   * suspensions). Returns the outcome for the processor to log.
   */
  async renewSubscription(
    subscriptionId: string,
  ): Promise<{ invoiceId: string; paid: boolean; reason?: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) throw new NotFoundException("Subscription not found");
    if (sub.cancelAtPeriodEnd || sub.state === SubscriptionState.CANCELED) {
      // Expire instead of renewing.
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { state: SubscriptionState.EXPIRED },
      });
      return { invoiceId: "", paid: false, reason: "canceled" };
    }

    // Reuse an existing OPEN invoice for this subscription (the dunning case —
    // a prior renewal already raised the period invoice and the charge failed),
    // so a retry never creates a duplicate invoice. Otherwise raise a fresh one.
    const open = await this.prisma.invoice.findFirst({
      where: { subscriptionId, state: InvoiceState.OPEN },
      orderBy: { createdAt: "desc" },
    });

    // Apply a scheduled DOWNGRADE only when raising a FRESH invoice, so the new
    // period bills the new (lower) price and the server moves to the new config
    // at the period boundary. If we're retrying an existing OPEN invoice
    // (dunning — already raised at the old price), defer the downgrade to the
    // next clean renewal rather than charging the old price for fewer resources.
    if (!open) {
      const scheduled = await this.prisma.pendingPlanChange.findUnique({
        where: { subscriptionId },
      });
      if (scheduled?.applyAtPeriodEnd) {
        await this.applyPendingPlanChange(scheduled);
      }
    }

    const invoice =
      open ?? (await this.createInvoiceForSubscription(subscriptionId));

    const method = await this.prisma.paymentMethod.findFirst({
      where: { userId: sub.userId, isDefault: true },
    });
    if (!method) {
      await this.handlePaymentFailure(invoice.id, "no default payment method");
      return {
        invoiceId: invoice.id,
        paid: false,
        reason: "no payment method",
      };
    }

    const customerId = await this.getGatewayCustomerId(sub.userId);
    const chargedMinor = Math.max(
      0,
      invoice.totalMinor - (invoice.amountPaidMinor ?? 0),
    );
    const result = await this.stripe.charge(
      invoice,
      method.gatewayRef,
      customerId,
    );
    if (result.success) {
      await this.markInvoicePaid(invoice.id, {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
        amountMinor: chargedMinor,
        currency: invoice.currency,
      });
      // Roll the billing period forward.
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          state: SubscriptionState.ACTIVE,
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addInterval(sub.currentPeriodEnd, sub.interval),
          renewalReminderSentAt: null, // remind again next period
        },
      });
      return { invoiceId: invoice.id, paid: true };
    }

    await this.handlePaymentFailure(
      invoice.id,
      result.failureReason ?? "charge failed",
      {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
      },
    );
    return { invoiceId: invoice.id, paid: false, reason: result.failureReason };
  }
}
