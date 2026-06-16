import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CouponsService } from '../billing/coupons.service';
import { GiftCardsService } from '../billing/gift-cards.service';
import { ServersService } from '../servers/servers.service';

export interface OrderResult {
  serverId: string;
  subscriptionId: string;
  invoiceId: string;
  /** Set when payment must be completed in a hosted flow before activation. */
  checkoutUrl?: string;
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
    private readonly servers: ServersService,
  ) {}

  async create(
    userId: string,
    dto: {
      productId: string;
      priceId: string;
      templateId: string;
      name: string;
      regionId?: string;
      slots?: number;
      paymentMethodId?: string;
      gateway?: 'stripe' | 'paypal';
      environment?: Record<string, string>;
      couponCode?: string;
      giftCardCode?: string;
    },
  ): Promise<OrderResult> {
    const price = await this.prisma.price.findUnique({
      where: { id: dto.priceId },
      include: { product: true },
    });
    if (!price || price.productId !== dto.productId) {
      throw new BadRequestException('Price does not belong to product');
    }

    // Order subtotal (per-slot products bill price-per-slot × slots).
    const quantity =
      price.product.perSlot && dto.slots && dto.slots > 0 ? dto.slots : 1;
    const subtotalMinor = price.amountMinor * quantity;

    // Validate any coupon / gift card UP FRONT so a bad code fails before we
    // create a subscription. Coupon discount is computed against the subtotal.
    let discountMinor = 0;
    let couponId: string | undefined;
    let couponCode: string | undefined;
    if (dto.couponCode?.trim()) {
      const v = await this.coupons.validate(dto.couponCode, userId, subtotalMinor);
      discountMinor = v.discountMinor;
      couponId = v.coupon.id;
      couponCode = v.coupon.code;
    }
    if (dto.giftCardCode?.trim()) {
      await this.giftCards.lookup(dto.giftCardCode); // throws if invalid
    }

    // 1) Create the subscription (interval derived from the chosen price).
    const subscription = await this.billing.createSubscription(userId, {
      productId: dto.productId,
      priceId: dto.priceId,
      interval: price.interval,
      slots: dto.slots,
    });

    // 2) Generate the first-period invoice (coupon discount baked in).
    const invoice = await this.billing.createInvoiceForSubscription(
      subscription.id,
      { discountMinor, couponCode },
    );
    if (couponId) {
      await this.coupons.recordRedemption(couponId, userId, invoice.id, discountMinor);
    }

    // 3) Apply a gift card toward the (discounted) total, then settle the rest.
    let paidNow = false;
    let checkoutUrl: string | undefined;
    let creditApplied = 0;
    if (dto.giftCardCode?.trim()) {
      creditApplied = await this.giftCards.redeemForInvoice(
        dto.giftCardCode,
        userId,
        invoice.id,
        invoice.totalMinor,
      );
    }

    if (creditApplied >= invoice.totalMinor && invoice.totalMinor > 0) {
      // Gift card covers the whole order → settle without a gateway.
      await this.billing.markInvoicePaid(invoice.id, {
        gateway: 'giftcard',
        gatewayRef: `gc-${invoice.id}`,
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
      });
      paidNow = true;
    } else {
      // Charge the outstanding balance (total − any gift credit) via the gateway.
      try {
        const pay = await this.billing.payInvoice(userId, invoice.id, dto.gateway);
        checkoutUrl = pay.checkoutUrl;
        paidNow = !!pay.paid;
      } catch {
        // Non-fatal: leave the invoice OPEN; the server stays reserved (unpaid).
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
        environment: dto.environment,
      },
      { deferProvision: !paidNow },
    );

    return {
      serverId: server.id,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      checkoutUrl,
    };
  }
}
