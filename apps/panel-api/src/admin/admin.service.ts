import { Injectable } from '@nestjs/common';
import {
  BillingInterval,
  ServerState,
  SubscriptionState,
  TicketState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { intervalMonths } from '../billing/interval.util';

/**
 * Cross-domain admin aggregations that don't belong to a single feature service.
 * Powers the JSON `/admin/metrics` dashboard summary.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * High-level platform summary: user/server/node counts, server breakdown by
   * state, open ticket count and an MRR estimate (active subscriptions
   * normalized to a monthly amount in minor units, per currency).
   */
  async adminSummary() {
    const [users, serversByState, nodesOnline, openTickets, activeSubs, servers] =
      await Promise.all([
        this.prisma.user.count({ where: { deletedAt: null } }),
        this.prisma.server.groupBy({
          by: ['state'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.node.count({
          where: { deletedAt: null, state: 'ONLINE' },
        }),
        this.prisma.ticket.count({
          where: {
            state: {
              in: [
                TicketState.OPEN,
                TicketState.PENDING_CUSTOMER,
                TicketState.PENDING_AGENT,
              ],
            },
          },
        }),
        this.prisma.subscription.findMany({
          where: {
            state: {
              in: [SubscriptionState.ACTIVE, SubscriptionState.TRIALING],
            },
          },
          include: { product: { include: { prices: true } } },
        }),
        this.prisma.server.count({ where: { deletedAt: null } }),
      ]);

    const states = Object.fromEntries(
      Object.values(ServerState).map((s) => [s, 0]),
    ) as Record<string, number>;
    for (const row of serversByState) {
      states[row.state] = row._count._all;
    }

    // MRR: normalize each active subscription's price to a monthly figure and
    // sum per currency.
    const mrrByCurrency: Record<string, number> = {};
    for (const sub of activeSubs) {
      const price = sub.product.prices.find((p) => p.id === sub.priceId);
      if (!price) continue;
      const months = intervalMonths(sub.interval as BillingInterval);
      const monthly = Math.round(price.amountMinor / months);
      mrrByCurrency[price.currency] =
        (mrrByCurrency[price.currency] ?? 0) + monthly;
    }
    const primaryCurrency = Object.keys(mrrByCurrency)[0] ?? 'USD';

    return {
      totals: {
        users,
        servers,
        nodesOnline,
        openTickets,
        activeSubscriptions: activeSubs.length,
        mrrMinor: mrrByCurrency[primaryCurrency] ?? 0,
        mrrCurrency: primaryCurrency,
        mrrByCurrency,
      },
      serversByState: states,
    };
  }
}
