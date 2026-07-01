import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { JOB, QUEUE, SuspensionJob } from "../queues/queue.constants";

const STUCK_INSTALL_MINUTES = 30;
const STUCK_SUSPEND_MINUTES = 15;

/**
 * Backstop sweep for servers stranded by a lost job, a node that died mid-op, or
 * a kill/unsuspend that never completed. The BullMQ queues already retry; this
 * catches the tail the retries miss so a customer is never silently stuck:
 *
 *  - A server sitting in INSTALLING/REINSTALLING far longer than an install should
 *    take is moved to CRASHED, so the owner/admin sees it (and can reinstall)
 *    instead of an eternal spinner.
 *  - A server still SUSPENDED while its subscription is back to ACTIVE (paid, but
 *    the unsuspend never landed) is re-queued for unsuspend.
 *
 * Enqueues use a deterministic jobId so running on every panel-api instance is
 * safe (BullMQ collapses duplicates).
 */
@Injectable()
export class LifecycleReconciler {
  private readonly logger = new Logger(LifecycleReconciler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.SUSPENSION)
    private readonly suspensionQueue: Queue<SuspensionJob>,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    await this.failStuckInstalls();
    await this.recoverStuckSuspensions();
  }

  /** INSTALLING/REINSTALLING for too long → CRASHED (visible + retryable). */
  private async failStuckInstalls(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_INSTALL_MINUTES * 60_000);
    const res = await this.prisma.server.updateMany({
      where: {
        deletedAt: null,
        state: { in: ["INSTALLING", "REINSTALLING"] },
        updatedAt: { lt: cutoff },
      },
      data: { state: "CRASHED" },
    });
    if (res.count) {
      this.logger.warn(
        `reconcile: moved ${res.count} server(s) stuck installing >${STUCK_INSTALL_MINUTES}m to CRASHED`,
      );
    }
  }

  /** SUSPENDED but the subscription is ACTIVE again → re-queue unsuspend. */
  private async recoverStuckSuspensions(): Promise<void> {
    const cutoff = new Date(Date.now() - STUCK_SUSPEND_MINUTES * 60_000);
    const stuck = await this.prisma.server.findMany({
      where: {
        deletedAt: null,
        state: "SUSPENDED",
        suspendedAt: { lt: cutoff },
        subscription: { is: { state: "ACTIVE" } },
      },
      select: { id: true },
    });
    for (const s of stuck) {
      await this.suspensionQueue.add(
        JOB.SUSPEND,
        {
          serverId: s.id,
          action: "unsuspend",
          reason: "reconcile: paid but still suspended",
        },
        { jobId: `reconcile-unsuspend-${s.id}`, removeOnComplete: true },
      );
      this.logger.log(
        `reconcile: re-queued unsuspend for ${s.id} (subscription active)`,
      );
    }
  }
}
