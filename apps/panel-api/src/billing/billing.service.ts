import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  Invoice,
  InvoiceState,
  PaymentMethod,
  PaymentState,
  Price,
  Prisma,
  Product,
  Subscription,
  SubscriptionState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../platform/settings.service';
import {
  Paginated,
  PaginationDto,
  paginate,
} from '../common/dto/pagination.dto';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';
import {
  JOB,
  QUEUE,
  SuspensionJob,
} from '../queues/queue.constants';
import { StripeGateway } from './gateways/stripe.gateway';
import { PayPalGateway } from './gateways/paypal.gateway';
import { EmailService } from '../email/email.service';
import { addInterval } from './interval.util';
import { generateInvoiceNumber } from './invoice-number.util';
import { calculateTax } from './tax.util';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { AddPaymentMethodDto } from './dto/add-payment-method.dto';

/** Details needed to record a successful payment against an invoice. */
export interface MarkPaidDetails {
  gateway: string;
  gatewayRef: string;
  /** Amount captured in minor units; defaults to the invoice total. */
  amountMinor?: number;
  currency?: string;
  gatewayInvoiceId?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly billingCfg: AppConfig['billing'];
  private readonly panelUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripe: StripeGateway,
    private readonly paypal: PayPalGateway,
    private readonly settings: SettingsService,
    private readonly email: EmailService,
    @InjectQueue(QUEUE.BILLING_RENEWAL) private readonly renewalQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
    @InjectQueue(QUEUE.PROVISIONING) private readonly provisionQueue: Queue,
  ) {
    this.billingCfg = this.config.get<AppConfig['billing']>('billing')!;
    this.panelUrl = this.config.get<AppConfig['panelUrl']>('panelUrl')!;
  }

  // ---- Products & Prices -------------------------------------------------

  /** List active products with their active prices. */
  listProducts(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: { prices: { where: { isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProduct(id: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { prices: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Admin: create a product. */
  createProduct(dto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({
      data: {
        id: uuidv7(),
        type: dto.type,
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        isActive: dto.isActive ?? true,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        slots: dto.slots,
        allowedTemplateIds: dto.allowedTemplateIds ?? [],
      },
    });
  }

  /** Admin: create a price for a product. */
  async createPrice(dto: CreatePriceDto) {
    // Ensure the product exists before attaching a price.
    await this.getProduct(dto.productId);
    try {
      return await this.prisma.price.create({
        data: {
          id: uuidv7(),
          productId: dto.productId,
          interval: dto.interval,
          currency: dto.currency ?? this.billingCfg.defaultCurrency,
          amountMinor: dto.amountMinor,
          stripePriceId: dto.stripePriceId,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A price for that interval and currency already exists — edit it instead.',
        );
      }
      throw e;
    }
  }

  /** Admin: update an existing price's mutable fields. */
  async updatePrice(id: string, dto: UpdatePriceDto): Promise<Price> {
    const price = await this.prisma.price.findUnique({ where: { id } });
    if (!price) throw new NotFoundException('Price not found');
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
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A price for that interval and currency already exists.',
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
    if (!price) throw new NotFoundException('Price not found');
    await this.prisma.price.delete({ where: { id } });
    return { id };
  }

  /** Admin: list all products (active and inactive) with their prices. */
  listAllProducts(): Promise<Product[]> {
    return this.prisma.product.findMany({
      include: { prices: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Admin: update a product's mutable fields. */
  async updateProduct(
    id: string,
    dto: Partial<CreateProductDto>,
  ): Promise<Product> {
    await this.getProduct(id);
    const data: Prisma.ProductUpdateInput = {};
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
    return this.prisma.product.update({ where: { id }, data });
  }

  /** Admin: soft-deactivate a product (kept for invoice history integrity). */
  async deleteProduct(id: string): Promise<Product> {
    await this.getProduct(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Public catalog: a single active product resolved by its slug. */
  async getActiveProductBySlug(slug: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { slug, isActive: true },
      include: { prices: { where: { isActive: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
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
      throw new BadRequestException('Price does not belong to product');
    }
    if (price.interval !== dto.interval) {
      throw new BadRequestException('Interval does not match the selected price');
    }

    const now = new Date();
    const currentPeriodEnd = addInterval(now, dto.interval);

    return this.prisma.subscription.create({
      data: {
        id: uuidv7(),
        userId,
        productId: dto.productId,
        priceId: dto.priceId,
        interval: dto.interval,
        state: SubscriptionState.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        autoRenew: true,
        gateway: dto.gateway ?? 'stripe',
      },
    });
  }

  listSubscriptions(userId: string): Promise<Subscription[]> {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getOwnedSubscription(
    userId: string,
    id: string,
  ): Promise<Subscription> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, userId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');
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
    await this.getOwnedSubscription(userId, id);

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
    if (sub.state === SubscriptionState.CANCELED || sub.state === SubscriptionState.EXPIRED) {
      throw new BadRequestException('Subscription cannot be resumed');
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
        orderBy: { createdAt: 'desc' },
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
        { number: { contains: pagination.q, mode: 'insensitive' } },
        { user: { email: { contains: pagination.q, mode: 'insensitive' } } },
      ];
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { user: BillingService.userSelect },
        orderBy: { createdAt: 'desc' },
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
        { user: { email: { contains: pagination.q, mode: 'insensitive' } } },
        { product: { name: { contains: pagination.q, mode: 'insensitive' } } },
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
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return paginate(data, total, pagination);
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
      currency: 'USD',
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
        { invoice: { number: { contains: pagination.q, mode: 'insensitive' } } },
        {
          invoice: {
            user: { email: { contains: pagination.q, mode: 'insensitive' } },
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
        orderBy: { createdAt: 'desc' },
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
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.state === InvoiceState.PAID) {
      throw new BadRequestException(
        'A paid invoice cannot be voided; issue a refund instead',
      );
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { state: InvoiceState.VOID },
    });
  }

  /** Permanently delete an invoice (and its line items/payments via cascade). */
  async deleteInvoice(id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.prisma.invoice.delete({ where: { id } });
  }

  /** Whether each payment gateway is configured (no secrets returned). Reads the
   *  effective config (owner-edited DB settings → env fallback). */
  async gatewayStatus(): Promise<{
    stripe: { configured: boolean; publishableKey: string | null };
    paypal: { configured: boolean };
  }> {
    const stripe = await this.settings.stripeConfig();
    const paypal = await this.settings.paypalConfig();
    return {
      stripe: {
        configured: !!stripe.secretKey,
        // The publishable key is not a secret; safe to expose to the client.
        publishableKey: stripe.publishableKey || null,
      },
      paypal: { configured: !!paypal.clientId && !!paypal.clientSecret },
    };
  }

  async getInvoice(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: { lineItems: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
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
    gateway?: 'stripe' | 'paypal',
  ): Promise<{ paid: boolean; checkoutUrl?: string; reason?: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.state === InvoiceState.PAID) {
      return { paid: true };
    }
    if (invoice.state !== InvoiceState.OPEN) {
      throw new BadRequestException(`Invoice is ${invoice.state}, not payable`);
    }

    // Hosted-checkout redirect targets — these are WEB routes (PANEL_URL).
    const successUrl = `${this.panelUrl}/billing?paid=1`;
    const cancelUrl = `${this.panelUrl}/billing`;

    // Explicit PayPal request → PayPal approval flow (when configured).
    if (gateway === 'paypal') {
      const paypal = await this.settings.paypalConfig();
      if (!paypal.clientId || !paypal.clientSecret) {
        throw new BadRequestException('PayPal is not configured');
      }
      try {
        const session = await this.paypal.createCheckoutSession({
          invoice,
          successUrl,
          cancelUrl,
        });
        if (!session.url) {
          throw new Error('PayPal did not return an approval URL');
        }
        return { paid: false, checkoutUrl: session.url };
      } catch (e) {
        this.logger.error(`PayPal checkout failed: ${(e as Error).message}`);
        throw new BadGatewayException(
          'Could not start PayPal checkout. Check the PayPal keys/mode in Payments settings.',
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
    gateway?: 'stripe' | 'paypal',
  ): Promise<{ paid: boolean; checkoutUrl?: string; reason?: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, ownerId: userId, deletedAt: null },
      select: { subscriptionId: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (!server.subscriptionId) {
      throw new BadRequestException('This server has no invoice to pay');
    }
    const invoice = await this.prisma.invoice.findFirst({
      where: { subscriptionId: server.subscriptionId, state: InvoiceState.OPEN },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!invoice) throw new BadRequestException('No open invoice for this server');
    return this.payInvoice(userId, invoice.id, gateway);
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

    const result = await this.stripe.charge(invoice, method.gatewayRef);
    if (result.success) {
      await this.markInvoicePaid(invoice.id, {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
      });
      return { paid: true };
    }
    await this.handlePaymentFailure(invoice.id, result.failureReason ?? 'charge failed', {
      gateway: this.stripe.name,
      gatewayRef: result.gatewayRef,
    });
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
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /**
   * Build a draft (OPEN) invoice for a subscription's current period: one line
   * item from the product/price, tax via the tax engine, and a year-scoped
   * invoice number.
   */
  async createInvoiceForSubscription(subscriptionId: string): Promise<Invoice> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { product: true, user: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const price = await this.prisma.price.findUnique({
      where: { id: subscription.priceId },
    });
    if (!price) throw new NotFoundException('Price not found for subscription');

    const currency = price.currency || this.billingCfg.defaultCurrency;
    const quantity = 1;
    const unitMinor = price.amountMinor;
    const subtotalMinor = unitMinor * quantity;

    // Resolve a tax region. TODO(impl): persist a billing address on User and use
    // it here; for now derive nothing and treat as no-tax unless a region exists.
    const taxRegion = this.resolveTaxRegion(subscription);
    const tax = calculateTax(subtotalMinor, {
      region: taxRegion ?? '',
    });
    const totalMinor = subtotalMinor + tax.taxMinor;

    const year = new Date().getUTCFullYear();
    const sequence = await this.nextInvoiceSequence(year);
    const number = generateInvoiceNumber(
      this.billingCfg.invoiceNumberPrefix,
      year,
      sequence,
    );

    const invoiceId = uuidv7();
    return this.prisma.invoice.create({
      data: {
        id: invoiceId,
        number,
        userId: subscription.userId,
        subscriptionId: subscription.id,
        state: InvoiceState.OPEN,
        currency,
        subtotalMinor,
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
              description: `${subscription.product.name} (${subscription.interval.toLowerCase()})`,
              quantity,
              unitMinor,
              amountMinor: subtotalMinor,
            },
          ],
        },
      },
      include: { lineItems: true },
    });
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
   * Best-effort tax region resolution. TODO(impl): read the customer's billing
   * country/state once an address model exists. Returns null when unknown.
   */
  private resolveTaxRegion(_subscription: Subscription): string | null {
    return null;
  }

  /** Mark an invoice PAID and record a SUCCEEDED Payment. */
  async markInvoicePaid(
    invoiceId: string,
    details: MarkPaidDetails,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

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
          amountPaidMinor: amountMinor,
          paidAt: new Date(),
          gateway: details.gateway,
          gatewayInvoiceId: details.gatewayInvoiceId ?? invoice.gatewayInvoiceId,
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
      where: { subscriptionId, deletedAt: null, state: 'PENDING_PAYMENT' },
      select: { id: true },
    });
    for (const s of pending) {
      await this.prisma.server.update({
        where: { id: s.id },
        data: { state: 'INSTALLING' },
      });
      await this.provisionQueue.add(JOB.PROVISION, { serverId: s.id });
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
        action: 'unsuspend',
        reason: 'invoice paid',
      };
      await this.suspensionQueue.add(JOB.SUSPEND, job);
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
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.prisma.payment.create({
      data: {
        id: uuidv7(),
        invoiceId,
        gateway: details?.gateway ?? invoice.gateway ?? 'unknown',
        gatewayRef: details?.gatewayRef ?? '',
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
        action: 'suspend',
        reason: `payment failed: ${reason}`,
      };
      await this.suspensionQueue.add(JOB.SUSPEND, job);
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
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async getOwnedPaymentMethod(
    userId: string,
    id: string,
  ): Promise<PaymentMethod> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, userId },
    });
    if (!method) throw new NotFoundException('Payment method not found');
    return method;
  }

  /** Remove a stored payment method owned by the user. */
  async removePaymentMethod(userId: string, id: string): Promise<void> {
    await this.getOwnedPaymentMethod(userId, id);
    // TODO(impl): detach the PaymentMethod from the processor (stripe.detach).
    await this.prisma.paymentMethod.delete({ where: { id } });
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
   * Begin adding a payment method: return the client material the web needs to
   * collect card details. TODO(impl): create a real Stripe SetupIntent and return
   * its client_secret; the placeholder URL keeps the flow wired end-to-end.
   */
  async createSetupIntent(userId: string): Promise<{ url: string; clientSecret?: string }> {
    void userId;
    return { url: `${this.panelUrl}/billing/payment-methods/add` };
  }

  // ---- Renewal & dunning (driven by the billing-renewal queue) -----------

  /**
   * Subscriptions whose current period has ended (or ends within `withinMs`),
   * that auto-renew and are not canceled/expired. The scheduler enqueues a
   * renewal job per id; this method is the source of truth for "due".
   */
  async findDueSubscriptions(withinMs = 0): Promise<string[]> {
    const cutoff = new Date(Date.now() + withinMs);
    const subs = await this.prisma.subscription.findMany({
      where: {
        autoRenew: true,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: cutoff },
        state: { in: [SubscriptionState.ACTIVE, SubscriptionState.TRIALING, SubscriptionState.PAST_DUE] },
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
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.cancelAtPeriodEnd || sub.state === SubscriptionState.CANCELED) {
      // Expire instead of renewing.
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { state: SubscriptionState.EXPIRED },
      });
      return { invoiceId: '', paid: false, reason: 'canceled' };
    }

    const invoice = await this.createInvoiceForSubscription(subscriptionId);

    const method = await this.prisma.paymentMethod.findFirst({
      where: { userId: sub.userId, isDefault: true },
    });
    if (!method) {
      await this.handlePaymentFailure(invoice.id, 'no default payment method');
      return { invoiceId: invoice.id, paid: false, reason: 'no payment method' };
    }

    const result = await this.stripe.charge(invoice, method.gatewayRef);
    if (result.success) {
      await this.markInvoicePaid(invoice.id, {
        gateway: this.stripe.name,
        gatewayRef: result.gatewayRef,
      });
      // Roll the billing period forward.
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          state: SubscriptionState.ACTIVE,
          currentPeriodStart: sub.currentPeriodEnd,
          currentPeriodEnd: addInterval(sub.currentPeriodEnd, sub.interval),
        },
      });
      return { invoiceId: invoice.id, paid: true };
    }

    await this.handlePaymentFailure(invoice.id, result.failureReason ?? 'charge failed', {
      gateway: this.stripe.name,
      gatewayRef: result.gatewayRef,
    });
    return { invoiceId: invoice.id, paid: false, reason: result.failureReason };
  }
}
