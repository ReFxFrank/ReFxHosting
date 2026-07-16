import { Injectable } from '@nestjs/common';
import { InvoiceState, SubscriptionState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from '../platform/alerts.service';
import { SUBSCRIPTION_PUBLIC_SELECT } from '../billing/subscription-public.util';
import { withPrimaryAllocation } from '../servers/allocation-port.util';
import {
  NODE_PUBLIC_SELECT,
  SERVER_SECRET_OMIT,
} from '../servers/server-secrets.util';

/**
 * One-shot dashboard aggregate for the authenticated customer: their servers and
 * states, active subscriptions, next-invoice/billing status, recent activity and
 * any active platform alerts. Designed as a single efficient response.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
  ) {}

  async summary(userId: string) {
    const [serverRows, subscriptions, openInvoices, nextInvoice, activity, alerts] =
      await Promise.all([
        this.prisma.server.findMany({
          where: {
            deletedAt: null,
            OR: [
              { ownerId: userId },
              { subUsers: { some: { userId, state: 'ACTIVE' } } },
            ],
          },
          // Same response hygiene as ServersService: never the secret Server
          // columns, and only the public node projection.
          omit: SERVER_SECRET_OMIT,
          include: {
            template: { select: { name: true, slug: true } },
            node: { select: NODE_PUBLIC_SELECT },
            allocations: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.subscription.findMany({
          where: {
            userId,
            state: {
              in: [SubscriptionState.ACTIVE, SubscriptionState.TRIALING],
            },
          },
          // Owner-safe projection — the raw row carries the processor linkage
          // (gatewaySubId) and acquisition attribution, which never belong on
          // a customer payload.
          select: {
            ...SUBSCRIPTION_PUBLIC_SELECT,
            product: { select: { name: true } },
          },
          orderBy: { currentPeriodEnd: 'asc' },
        }),
        this.prisma.invoice.count({
          where: { userId, state: InvoiceState.OPEN },
        }),
        this.prisma.invoice.findFirst({
          where: { userId, state: InvoiceState.OPEN },
          orderBy: { dueAt: 'asc' },
          select: { id: true, totalMinor: true, currency: true, dueAt: true },
        }),
        this.prisma.auditLog.findMany({
          where: { actorId: userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.alerts.listActiveAlerts(),
      ]);

    // Flatten the connection address the same way the servers list does — the
    // web renders {alias || ip}:{port} from `primaryAllocation` on each card.
    const servers = serverRows.map((s) => withPrimaryAllocation(s));

    // Server state breakdown.
    const states: Record<string, number> = {};
    for (const s of servers) {
      states[s.state] = (states[s.state] ?? 0) + 1;
    }

    // Aggregate provisioned resource usage (limits, not live telemetry).
    const usage = servers.reduce(
      (acc, s) => {
        acc.cpuCores += s.cpuCores;
        acc.memTotalMb += s.memoryMb;
        acc.diskTotalMb += s.diskMb;
        return acc;
      },
      { cpuCores: 0, memTotalMb: 0, diskTotalMb: 0 },
    );

    return {
      servers,
      serversByState: states,
      subscriptions,
      usage: {
        cpuPct: 0, // live telemetry is delivered via the stats endpoints
        memUsedMb: 0,
        memTotalMb: usage.memTotalMb,
        diskUsedMb: 0,
        diskTotalMb: usage.diskTotalMb,
      },
      billing: {
        nextInvoiceMinor: nextInvoice?.totalMinor ?? 0,
        currency: nextInvoice?.currency ?? 'USD',
        nextDueAt: nextInvoice?.dueAt ?? null,
        openInvoices,
      },
      activity,
      alerts,
    };
  }
}
