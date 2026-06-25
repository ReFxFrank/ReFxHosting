import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

// High-frequency telemetry is kept for charts (the longest history range is 30d,
// see stats.service RANGE_MS) plus margin, then pruned so the tables don't grow
// without bound. ServerStat is written ~every 5s, NodeHeartbeat ~every 15s.
const RETENTION_DAYS = 45;
// Delete in batches so a large first prune can't hold one giant transaction/lock.
const BATCH = 5000;

@Injectable()
export class TelemetryRetentionScheduler {
  private readonly logger = new Logger(TelemetryRetentionScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nightly prune of telemetry older than the retention window. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    try {
      const stats = await this.pruneBatched((ids) =>
        this.prisma.serverStat.deleteMany({ where: { id: { in: ids } } }),
      (take) =>
        this.prisma.serverStat.findMany({
          where: { recordedAt: { lt: cutoff } },
          select: { id: true },
          take,
        }),
      );
      const beats = await this.pruneBatched((ids) =>
        this.prisma.nodeHeartbeat.deleteMany({ where: { id: { in: ids } } }),
      (take) =>
        this.prisma.nodeHeartbeat.findMany({
          where: { recordedAt: { lt: cutoff } },
          select: { id: true },
          take,
        }),
      );
      if (stats || beats) {
        this.logger.log(
          `Pruned telemetry older than ${RETENTION_DAYS}d: ${stats} ServerStat, ${beats} NodeHeartbeat row(s).`,
        );
      }
    } catch (e) {
      // Best-effort maintenance — never let a prune failure crash the scheduler.
      this.logger.warn(`Telemetry prune failed: ${(e as Error).message}`);
    }
  }

  private async pruneBatched(
    del: (ids: string[]) => Promise<{ count: number }>,
    find: (take: number) => Promise<{ id: string }[]>,
  ): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await find(BATCH);
      if (rows.length === 0) break;
      const res = await del(rows.map((r) => r.id));
      total += res.count;
      if (rows.length < BATCH) break;
    }
    return total;
  }
}
