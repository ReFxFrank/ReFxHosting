import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
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
    },
  ): Promise<OrderResult> {
    const price = await this.prisma.price.findUnique({
      where: { id: dto.priceId },
    });
    if (!price || price.productId !== dto.productId) {
      throw new BadRequestException('Price does not belong to product');
    }

    // 1) Create the subscription (interval derived from the chosen price).
    const subscription = await this.billing.createSubscription(userId, {
      productId: dto.productId,
      priceId: dto.priceId,
      interval: price.interval,
      slots: dto.slots,
    });

    // 2) Generate the first-period invoice.
    const invoice = await this.billing.createInvoiceForSubscription(
      subscription.id,
    );

    // 3) Attempt payment. A saved-method charge may settle immediately; a hosted
    //    flow returns a checkout URL to redirect to. A gateway error leaves the
    //    invoice OPEN for the customer to pay from billing.
    let checkoutUrl: string | undefined;
    let paidNow = false;
    try {
      const pay = await this.billing.payInvoice(userId, invoice.id, dto.gateway);
      checkoutUrl = pay.checkoutUrl;
      paidNow = !!pay.paid;
    } catch {
      // Non-fatal: leave the invoice OPEN; the server stays reserved (unpaid).
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
