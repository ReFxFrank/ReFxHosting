import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient, PowerSignal } from '../agent/agent.client';
import { BackupJob, JOB, QUEUE } from '../queues/queue.constants';
import { uuidv7 } from '../common/util/uuid';
import { AppConfig } from '../config/configuration';
import { nextCronRun } from './cron.util';

const POWER_SIGNALS: PowerSignal[] = ['start', 'stop', 'restart', 'kill'];
/** Cap a single inter-task delay so a schedule can't block the runner forever. */
const MAX_TASK_DELAY_MS = 30_000;

/**
 * Fires server schedules. Once a minute it claims every due schedule atomically
 * (advancing nextRunAt so concurrent instances don't double-run), then executes
 * its tasks in order against the node agent. Manual "Run now" reuses the same
 * execution path.
 */
@Injectable()
export class ScheduleRunner {
  private readonly logger = new Logger(ScheduleRunner.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    config: ConfigService,
    @InjectQueue(QUEUE.BACKUPS) private readonly backupQueue: Queue<BackupJob>,
  ) {
    // Reuse the in-process scheduler master switch (BILLING_SCHEDULER).
    this.enabled = config.get<AppConfig['billing']>('billing')!.schedulerEnabled;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.enabled) return;
    const now = new Date();
    const due = await this.prisma.schedule.findMany({
      where: { isActive: true, nextRunAt: { not: null, lte: now } },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        server: { include: { node: true, owner: { select: { timezone: true } } } },
      },
    });
    for (const schedule of due) {
      // Atomically claim: only the instance that flips THIS nextRunAt forward
      // runs it. The next occurrence is computed in the owner's timezone.
      const tz = schedule.server.owner?.timezone || 'UTC';
      const claimed = await this.prisma.schedule.updateMany({
        where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
        data: { nextRunAt: nextCronRun(schedule.cron, now, tz), lastRunAt: now },
      });
      if (claimed.count === 0) continue;
      if (schedule.onlyWhenOnline && schedule.server.state !== 'RUNNING') continue;
      await this.execute(schedule);
    }
  }

  /** Manually run a schedule now (the controller "Run now" button). */
  async runNow(serverId: string, scheduleId: string): Promise<{ accepted: true }> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, serverId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        server: { include: { node: true } },
      },
    });
    if (!schedule) return { accepted: true };
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { lastRunAt: new Date() },
    });
    // Fire-and-forget so the HTTP call returns promptly; errors are logged.
    void this.execute(schedule);
    return { accepted: true };
  }

  private async execute(
    schedule: Awaited<ReturnType<ScheduleRunner['loadType']>>,
  ): Promise<void> {
    const { server } = schedule;
    for (const task of schedule.tasks) {
      if (task.timeOffsetMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(task.timeOffsetMs, MAX_TASK_DELAY_MS)));
      }
      try {
        if (task.action === 'POWER') {
          const signal = task.payload as PowerSignal;
          if (!POWER_SIGNALS.includes(signal)) {
            throw new Error(`invalid power signal "${task.payload}"`);
          }
          await this.agent.power(server.node, server.id, signal);
        } else if (task.action === 'COMMAND') {
          await this.agent.sendCommand(server.node, server.id, task.payload);
        } else if (task.action === 'BACKUP') {
          const backup = await this.prisma.backup.create({
            data: {
              id: uuidv7(),
              serverId: server.id,
              name: task.payload || `Scheduled · ${schedule.name}`,
              state: 'PENDING',
              ignoredFiles: [],
            },
          });
          await this.backupQueue.add(JOB.RUN_BACKUP, {
            serverId: server.id,
            backupId: backup.id,
          });
        }
      } catch (e) {
        this.logger.warn(
          `schedule ${schedule.id} task ${task.action} failed: ${(e as Error).message}`,
        );
        if (!task.continueOnFailure) break;
      }
    }
  }

  // Type helper: the shape execute() expects (schedule + tasks + server.node).
  private loadType() {
    return this.prisma.schedule.findFirstOrThrow({
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        server: { include: { node: true } },
      },
    });
  }
}
