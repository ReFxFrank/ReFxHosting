import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CouponsService } from '../billing/coupons.service';
import { GiftCardsService } from '../billing/gift-cards.service';
import { CreditService } from '../billing/credit.service';
import { ServersService } from '../servers/servers.service';

export interface OrderResult {
  serverId: string;
  subscriptionId: string;
  invoiceId: string;
  /** Set when payment must be completed in a hosted flow before activation. */
  checkoutUrl?: string;
  /** True when the order is already settled (free/fully-covered) and provisioning. */
  paid: boolean;
}

/**
 * Storefront order orchestration: subscribe → invoice → provision, reusing
 * BillingService and ServersService end to end. The live payment capture is the
 * single external piece left as TODO(impl); the rest of the flow is wired.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly coupons: CouponsService,
    private readonly giftCards: GiftCardsService,
    private readonly credit: CreditService,
    private readonly servers: ServersService,
  ) {}

  async create(
    userId: string,
    dto: {
      productId: string;
      priceId: string;
      templateId: string;
      name: string;
      hardwareTierId?: string;
      regionId?: string;
      nodeId?: string;
      slots?: number;
      paymentMethodId?: string;
      gateway?: 'stripe' | 'paypal';
      environment?: Record<string, string>;
      couponCode?: string;
      giftCardCode?: string;
      useCredit?: boolean;
    },
  ): Promise<OrderResult> {
    // A billing address is required before any purchase (tax + basic KYC). This
    // also covers accounts created before the field was mandatory.
    const buyer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailVerifiedAt: true,
        addressLine1: true,
        city: true,
        postalCode: true,
        country: true,
        region: true,
      },
    });
    // Email must be verified before any server can be ordered/provisioned.
    if (!buyer?.emailVerifiedAt) {
      throw new ForbiddenException(
        'Please verify your email address before ordering a server. Check your inbox for the verification link.',
      );
    }
    if (!buyer?.addressLine1 || !buyer.city || !buyer.postalCode || !buyer.country) {
      throw new BadRequestException(
        'Add your billing address in Account settings before placing an order.',
      );
    }
    if (buyer.country.toUpperCase() === 'US' && !buyer.region) {
      throw new BadRequestException(
        'Add your state to your billing address before placing an order.',
      );
    }

    const price = await this.prisma.price.findUnique({
      where: { id: dto.priceId },
      include: { product: true, hardwareTier: true },
    });
    if (!price || price.productId !== dto.productId) {
      throw new BadRequestException('Price does not belong to product');
    }
    const product = price.product;
    if (!product.isActive) {
      throw new BadRequestException('This product is not available');
    }
    if (!price.isActive) {
      throw new BadRequestException('That price is no longer available');
    }

    // Validate the configuration method matches the product's billing model, and
    // compute the order quantity. Pricing is ALWAYS taken from the DB price row
    // (price.amountMinor) — never trusted from the client.
    let quantity = 1;
    if (product.billingModel === 'PER_SLOT') {
      // Voice / per-slot: a slot count within the product's min/max + step.
      const slots = dto.slots ?? 0;
      const min = product.minSlots || 1;
      const max = product.maxSlots || min;
      const step = product.slotStep || 1;
      if (slots < min || slots > max) {
        throw new BadRequestException(`Slots must be between ${min} and ${max}`);
      }
      if ((slots - min) % step !== 0) {
        throw new BadRequestException(`Slots must be in steps of ${step}`);
      }
      if (price.hardwareTierId) {
        throw new BadRequestException('This product is not configured by hardware tier');
      }
      quantity = slots;
    } else {
      // Game / hardware tier: a tier that exists, is active, and owns the price.
      if (!dto.hardwareTierId) {
        throw new BadRequestException('Select a hardware tier');
      }
      const tier = price.hardwareTier;
      if (!tier || tier.productId !== product.id) {
        throw new BadRequestException('Hardware tier does not belong to product');
      }
      if (!tier.isActive) {
        throw new BadRequestException('That hardware tier is not available');
      }
      if (price.hardwareTierId !== dto.hardwareTierId) {
        throw new BadRequestException('Price does not belong to the selected tier');
      }
      quantity = 1;
    }
    const subtotalMinor = price.amountMinor * quantity;

    // Validate any coupon / gift card UP FRONT so a bad code fails before we
    // create a subscription. Coupon discount is computed against the subtotal.
    let discountMinor = 0;
    let couponCode: string | undefined;
    let couponRedemptionId: string | undefined;
    if (dto.couponCode?.trim()) {
      const v = await this.coupons.validate(dto.couponCode, userId, subtotalMinor);
      discountMinor = v.discountMinor;
      couponCode = v.coupon.code;
      // Atomically reserve a redemption (enforces caps) BEFORE we create the
      // subscription, so a cap hit fails the order cleanly with no orphan rows.
      couponRedemptionId = await this.coupons.reserveRedemption(v.coupon.id, userId);
    }
    if (dto.giftCardCode?.trim()) {
      await this.giftCards.lookup(dto.giftCardCode); // throws if invalid
    }

    // 1) Create the subscription (interval derived from the chosen price).
    const subscription = await this.billing.createSubscription(userId, {
      productId: dto.productId,
      priceId: dto.priceId,
      interval: price.interval,
      hardwareTierId: dto.hardwareTierId,
      slots: dto.slots,
    });

    // PayPal recurring: fixed-price orders with no discounts/credit start a real
    // PayPal subscription (auto-bills every cycle). The plan price is the total,
    // so the first invoice is raised tax-free to match what PayPal charges.
    // Per-slot or discounted PayPal orders fall back to the one-time flow.
    const wantsPaypalSub =
      dto.gateway === 'paypal' &&
      quantity === 1 &&
      !dto.couponCode?.trim() &&
      !dto.giftCardCode?.trim() &&
      !dto.useCredit;

    // 2) Generate the first-period invoice (coupon discount baked in).
    const invoice = await this.billing.createInvoiceForSubscription(
      subscription.id,
      { discountMinor, couponCode, noTax: wantsPaypalSub },
    );
    if (couponRedemptionId) {
      await this.coupons.attachRedemption(couponRedemptionId, invoice.id, discountMinor);
    }

    // 3) Apply a gift card, then account credit, toward the (discounted) total,
    //    then settle the remaining balance through the gateway.
    let paidNow = false;
    let checkoutUrl: string | undefined;
    let applied = 0; // total non-gateway credit applied (gift card + store credit)

    if (wantsPaypalSub) {
      // Hand off to a recurring PayPal subscription; the first payment settles
      // this invoice + provisions via the PayPal webhook.
      try {
        const res = await this.billing.startPayPalSubscription(userId, subscription.id);
        checkoutUrl = res.approveUrl;
      } catch {
        // Non-fatal: leave the invoice OPEN; the server stays reserved (unpaid).
      }
    } else {
      if (dto.giftCardCode?.trim()) {
        applied += await this.giftCards.redeemForInvoice(
          dto.giftCardCode,
          userId,
          invoice.id,
          invoice.totalMinor,
        );
      }
      if (dto.useCredit) {
        // Draw down store credit for whatever the gift card didn't cover.
        applied += await this.credit.applyToInvoice(
          userId,
          invoice.id,
          Math.max(0, invoice.totalMinor - applied),
        );
      }

      if (invoice.totalMinor > 0 && applied >= invoice.totalMinor) {
        // Gift card and/or credit cover the whole order → settle without a gateway.
        await this.billing.markInvoicePaid(invoice.id, {
          gateway: 'credit',
          gatewayRef: `credit-${invoice.id}`,
          amountMinor: invoice.totalMinor,
          currency: invoice.currency,
        });
        paidNow = true;
      } else {
        // Charge the outstanding balance (total − any applied credit) via the
        // gateway. payInvoice settles directly if the balance is already zero
        // (e.g. a 100%-off coupon), so a $0 order never hits a hosted checkout.
        try {
          const pay = await this.billing.payInvoice(userId, invoice.id, dto.gateway);
          checkoutUrl = pay.checkoutUrl;
          paidNow = !!pay.paid;
        } catch {
          // Non-fatal: leave the invoice OPEN; the server stays reserved (unpaid).
        }
      }
    }

    // 4) Create the server, but only INSTALL it now if payment already cleared.
    //    Otherwise it's reserved in PENDING_PAYMENT and provisioned by
    //    billing.markInvoicePaid once the hosted payment settles (webhook).
    const server = await this.servers.create(
      userId,
      {
        name: dto.name,
        subscriptionId: subscription.id,
        templateId: dto.templateId,
        regionId: dto.regionId,
        nodeId: dto.nodeId,
        environment: dto.environment,
      },
      { deferProvision: !paidNow },
    );

    return {
      serverId: server.id,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      checkoutUrl,
      paid: paidNow,
    };
  }
}
