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
      paymentMethodId?: string;
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
    });

    // 2) Generate the first-period invoice.
    const invoice = await this.billing.createInvoiceForSubscription(
      subscription.id,
    );

    // 3) Attempt payment so the server starts in a paid state. A failed/absent
    //    payment still provisions; dunning + suspension are handled by billing.
    let checkoutUrl: string | undefined;
    try {
      const pay = await this.billing.payInvoice(userId, invoice.id);
      checkoutUrl = pay.checkoutUrl;
      // TODO(impl): for paymentMethodId-specific capture, route the charge to the
      // selected method via the gateway instead of the account default.
    } catch {
      // Non-fatal: leave the invoice OPEN for the customer to pay.
    }

    // 4) Provision the server bound to the subscription (queues the agent install).
    const server = await this.servers.create(userId, {
      name: dto.name,
      subscriptionId: subscription.id,
      templateId: dto.templateId,
      environment: dto.environment,
    });
    void dto.regionId; // TODO(impl): honor region preference in node placement.

    return {
      serverId: server.id,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      checkoutUrl,
    };
  }
}
