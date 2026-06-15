import { Injectable, NotFoundException } from '@nestjs/common';
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
   * Full account view for the admin user-detail page: profile + contact, billing
   * (subscriptions, recent invoices, payment methods) and owned servers. Strips
   * every secret (password hash, TOTP seed, gateway refs) — staff never see those.
   */
  async userDetail(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        ownedServers: {
          where: { deletedAt: null },
          select: {
            id: true,
            shortId: true,
            name: true,
            state: true,
            node: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        subscriptions: {
          select: {
            id: true,
            state: true,
            interval: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            gateway: true,
            createdAt: true,
            product: { select: { id: true, name: true, type: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          select: {
            id: true,
            number: true,
            state: true,
            currency: true,
            totalMinor: true,
            amountPaidMinor: true,
            createdAt: true,
            paidAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        paymentMethods: {
          select: {
            id: true,
            gateway: true,
            brand: true,
            last4: true,
            expMonth: true,
            expYear: true,
            isDefault: true,
          },
        },
        _count: {
          select: { ownedServers: true, subscriptions: true, tickets: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Drop sensitive columns before returning to the staff UI.
    const {
      passwordHash: _ph,
      totpSecretEnc: _ts,
      ...safe
    } = user as typeof user & { passwordHash?: string; totpSecretEnc?: string };
    return safe;
  }

  /**
   * High-level platform summary: user/server/node counts, server breakdown by
   * state, open ticket count and an MRR estimate (active subscriptions
   * normalized to a monthly amount in minor units, per currency).
   */
  async adminSummary() {
    const [
      users,
      serversByState,
      nodesOnline,
      openTickets,
      activeSubs,
      servers,
      nodeRows,
    ] = await Promise.all([
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
        this.prisma.node.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            memoryMb: true,
            diskMb: true,
            heartbeats: {
              orderBy: { recordedAt: 'desc' },
              take: 1,
              select: { cpuPct: true, memUsedMb: true, diskUsedMb: true },
            },
          },
        }),
      ]);

    // Per-node health for the admin overview, derived from the latest heartbeat
    // against advertised capacity (0% when a node hasn't reported yet).
    const pct = (used: number, total: number) =>
      total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const nodes = nodeRows.map((n) => {
      const hb = n.heartbeats[0];
      return {
        id: n.id,
        name: n.name,
        cpuPct: Math.min(100, Math.round(hb?.cpuPct ?? 0)),
        memPct: pct(hb?.memUsedMb ?? 0, n.memoryMb),
        diskPct: pct(hb?.diskUsedMb ?? 0, n.diskMb),
      };
    });

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
        // Alias consumed by the web "Revenue" card.
        revenueMinor: mrrByCurrency[primaryCurrency] ?? 0,
        mrrCurrency: primaryCurrency,
        mrrByCurrency,
      },
      serversByState: states,
      nodes,
    };
  }
}
