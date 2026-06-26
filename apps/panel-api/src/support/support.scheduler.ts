import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TicketState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../platform/notifications.service';
import { AppConfig } from '../config/configuration';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Auto-progresses stale tickets so the queue doesn't accumulate forgotten
 * threads:
 *   1. PENDING_CUSTOMER idle past `autoResolveDays` -> RESOLVED (customer
 *      notified; they can still reply to reopen).
 *   2. RESOLVED idle past `autoCloseDays` -> CLOSED (locks further replies).
 *
 * Stage 1 uses a per-ticket conditional update + notify, so running on multiple
 * panel-api instances never double-notifies. Stage 2 is a single idempotent
 * bulk update. Toggle with SUPPORT_AUTORESOLVE=false; set either *_DAYS to 0 to
 * disable that stage individually.
 */
@Injectable()
export class SupportScheduler {
  private readonly logger = new Logger(SupportScheduler.name);
  private readonly cfg: AppConfig['support'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    config: ConfigService,
  ) {
    this.cfg = config.get<AppConfig['support']>('support')!;
    if (!this.cfg.autoResolveEnabled) {
      this.logger.log(
        'Support auto-resolve disabled (SUPPORT_AUTORESOLVE=false).',
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (!this.cfg.autoResolveEnabled) return;
    await this.autoResolveStale();
    await this.autoCloseResolved();
  }

  /** PENDING_CUSTOMER idle past the threshold -> RESOLVED (+ notify requester). */
  async autoResolveStale(): Promise<number> {
    const days = this.cfg.autoResolveDays;
    if (days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * DAY_MS);

    const stale = await this.prisma.ticket.findMany({
      where: { state: TicketState.PENDING_CUSTOMER, updatedAt: { lt: cutoff } },
      select: { id: true, number: true, subject: true, requesterId: true },
      take: 200,
    });

    let resolved = 0;
    for (const t of stale) {
      // Conditional on the state still being PENDING_CUSTOMER: if another
      // instance (or a fresh customer reply) changed it first, count is 0.
      const res = await this.prisma.ticket.updateMany({
        where: { id: t.id, state: TicketState.PENDING_CUSTOMER },
        data: { state: TicketState.RESOLVED, resolvedAt: new Date() },
      });
      if (res.count !== 1) continue;
      resolved++;
      await this.notifications
        .createNotification(t.requesterId, {
          title: `Ticket #${t.number} auto-resolved`,
          body: `"${t.subject}" was marked resolved after ${days} day${days === 1 ? '' : 's'} with no reply. Reply on the ticket to reopen it, or open a new one if you still need help.`,
        })
        .catch(() => undefined);
    }
    if (resolved) this.logger.log(`auto-resolved ${resolved} stale ticket(s)`);
    return resolved;
  }

  /** RESOLVED idle past the threshold -> CLOSED (bulk, idempotent). */
  async autoCloseResolved(): Promise<number> {
    const days = this.cfg.autoCloseDays;
    if (days <= 0) return 0;
    const cutoff = new Date(Date.now() - days * DAY_MS);

    const res = await this.prisma.ticket.updateMany({
      where: { state: TicketState.RESOLVED, updatedAt: { lt: cutoff } },
      data: { state: TicketState.CLOSED },
    });
    if (res.count) this.logger.log(`auto-closed ${res.count} resolved ticket(s)`);
    return res.count;
  }
}
