import {
  BadRequestException,
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
  Prisma,
  Product,
  Subscription,
  SubscriptionState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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
import { addInterval } from './interval.util';
import { generateInvoiceNumber } from './invoice-number.util';
import { calculateTax } from './tax.util';
import { CreateProductDto } from './dto/create-product.dto';
import { CreatePriceDto } from './dto/create-price.dto';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stripe: StripeGateway,
    @InjectQueue(QUEUE.BILLING_RENEWAL) private readonly renewalQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
  ) {
    this.billingCfg = this.config.get<AppConfig['billing']>('billing')!;
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
    return this.prisma.price.create({
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

  async getInvoice(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: { lineItems: true, payments: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
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

    // If the invoice belongs to a past-due subscription that has now been paid,
    // reactivate it and lift suspensions on its servers.
    if (invoice.subscriptionId) {
      await this.reactivateOnPayment(invoice.subscriptionId);
    }

    return updated;
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
