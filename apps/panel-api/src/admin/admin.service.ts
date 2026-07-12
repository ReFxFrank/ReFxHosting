import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BillingInterval,
  InvoiceState,
  Prisma,
  ServerState,
  SubscriptionState,
  TicketState,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { intervalMonths } from '../billing/interval.util';
import {
  Paginated,
  PaginationDto,
  paginate,
} from '../common/dto/pagination.dto';

/**
 * Cross-domain admin aggregations that don't belong to a single feature service.
 * Powers the JSON `/admin/metrics` dashboard summary.
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paying customers: accounts that have at least one ACTIVE subscription backed
   * by a PAID invoice. (The "Users" list is everyone; "Customers" is people who
   * actually have a live, paid service.) Returns lightweight per-row aggregates
   * for the staff table: active services, server count and lifetime spend.
   */
  async listCustomers(pagination: PaginationDto): Promise<
    Paginated<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      state: string;
      globalRole: string;
      createdAt: Date;
      activeServices: number;
      servers: number;
      lifetimeSpendMinor: number;
    }>
  > {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      subscriptions: {
        some: {
          state: SubscriptionState.ACTIVE,
          invoices: { some: { state: InvoiceState.PAID } },
        },
      },
    };
    if (pagination.q) {
      where.OR = [
        { email: { contains: pagination.q, mode: 'insensitive' } },
        { firstName: { contains: pagination.q, mode: 'insensitive' } },
        { lastName: { contains: pagination.q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          state: true,
          globalRole: true,
          createdAt: true,
          _count: { select: { ownedServers: true } },
          subscriptions: {
            where: { state: SubscriptionState.ACTIVE },
            select: { id: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Lifetime spend per user (sum of settled invoices) in one grouped query.
    const ids = users.map((u) => u.id);
    const spend = ids.length
      ? await this.prisma.invoice.groupBy({
          by: ['userId'],
          where: { userId: { in: ids }, state: InvoiceState.PAID },
          _sum: { amountPaidMinor: true },
        })
      : [];
    const spendById = new Map(
      spend.map((s) => [s.userId, s._sum.amountPaidMinor ?? 0]),
    );

    const data = users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      state: u.state,
      globalRole: u.globalRole,
      createdAt: u.createdAt,
      activeServices: u.subscriptions.length,
      servers: u._count.ownedServers,
      lifetimeSpendMinor: spendById.get(u.id) ?? 0,
    }));

    return paginate(data, total, pagination);
  }

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

  /**
   * Acquisition report for /admin/growth: signups, first-time payers and
   * paid revenue grouped by first-touch channel (utm_source captured at
   * signup, referral links, plain referrer, or direct), plus the landing
   * pages that actually produce accounts and a referral-program summary.
   */
  async growthReport(days: number) {
    const window = Math.min(Math.max(days, 1), 3650);
    const since = new Date(Date.now() - window * 86_400_000);

    // First-touch channel per user, derived once and reused by both queries.
    const channelExpr = Prisma.sql`COALESCE(
      NULLIF(u."attribution"->>'source', ''),
      CASE
        WHEN u."referredById" IS NOT NULL OR NULLIF(u."attribution"->>'ref', '') IS NOT NULL THEN 'referral'
        WHEN NULLIF(u."attribution"->>'referrer', '') IS NOT NULL THEN 'organic / referring site'
        ELSE 'direct'
      END
    )`;

    const [signups, payers, landings, referral, revenueTotal] =
      await Promise.all([
        this.prisma.$queryRaw<{ channel: string; signups: number }[]>`
          SELECT ${channelExpr} AS channel, COUNT(*)::int AS signups
          FROM "User" u
          WHERE u."createdAt" >= ${since} AND u."deletedAt" IS NULL
          GROUP BY 1
          ORDER BY 2 DESC`,
        this.prisma.$queryRaw<
          { channel: string; payers: number; revenueMinor: number }[]
        >`
          SELECT ${channelExpr} AS channel,
                 COUNT(DISTINCT i."userId")::int AS payers,
                 COALESCE(SUM(i."amountPaidMinor"), 0)::int AS "revenueMinor"
          FROM "Invoice" i
          JOIN "User" u ON u."id" = i."userId"
          WHERE i."state" = 'PAID' AND i."paidAt" >= ${since}
          GROUP BY 1
          ORDER BY 3 DESC`,
        this.prisma.$queryRaw<{ landing: string; signups: number }[]>`
          SELECT COALESCE(NULLIF(u."attribution"->>'landing', ''), '(unknown)') AS landing,
                 COUNT(*)::int AS signups
          FROM "User" u
          WHERE u."createdAt" >= ${since}
            AND u."deletedAt" IS NULL
            AND u."attribution" IS NOT NULL
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 12`,
        Promise.all([
          this.prisma.user.count({
            where: { referredById: { not: null }, createdAt: { gte: since } },
          }),
          this.prisma.user.count({
            where: {
              referredById: { not: null },
              referralRewardedAt: { not: null, gte: since },
            },
          }),
          this.prisma.creditTransaction.aggregate({
            where: { reason: 'REFERRAL', createdAt: { gte: since } },
            _sum: { amountMinor: true },
          }),
        ]),
        this.prisma.invoice.aggregate({
          where: { state: InvoiceState.PAID, paidAt: { gte: since } },
          _sum: { amountPaidMinor: true },
        }),
      ]);

    // Zip signups and payer/revenue rows into one table.
    const byChannel = new Map<
      string,
      { channel: string; signups: number; payers: number; revenueMinor: number }
    >();
    for (const row of signups) {
      byChannel.set(row.channel, { ...row, payers: 0, revenueMinor: 0 });
    }
    for (const row of payers) {
      const existing = byChannel.get(row.channel) ?? {
        channel: row.channel,
        signups: 0,
        payers: 0,
        revenueMinor: 0,
      };
      existing.payers = row.payers;
      existing.revenueMinor = row.revenueMinor;
      byChannel.set(row.channel, existing);
    }

    const [referredSignups, referredConverted, referralCredit] = referral;
    return {
      days: window,
      channels: [...byChannel.values()].sort(
        (a, b) => b.revenueMinor - a.revenueMinor || b.signups - a.signups,
      ),
      landings,
      totals: {
        signups: signups.reduce((n, r) => n + r.signups, 0),
        payers: payers.reduce((n, r) => n + r.payers, 0),
        revenueMinor: revenueTotal._sum.amountPaidMinor ?? 0,
      },
      referral: {
        signups: referredSignups,
        converted: referredConverted,
        creditIssuedMinor: referralCredit._sum.amountMinor ?? 0,
      },
    };
  }
}
