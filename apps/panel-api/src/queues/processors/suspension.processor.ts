import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient } from '../../agent/agent.client';
import { JOB, QUEUE, SuspensionJob } from '../queue.constants';

/**
 * Applies suspend/unsuspend across the servers a job targets. A job may target
 * a single server or an entire subscription (all its servers). Suspending stops
 * the workload on the node and marks the server SUSPENDED; unsuspending lifts it
 * back to OFFLINE.
 */
@Processor(QUEUE.SUSPENSION)
export class SuspensionProcessor extends WorkerHost {
  private readonly logger = new Logger(SuspensionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {
    super();
  }

  async process(job: Job<SuspensionJob>): Promise<void> {
    if (job.name !== JOB.SUSPEND) return;
    const { serverId, subscriptionId, action, reason } = job.data;

    const servers = await this.prisma.server.findMany({
      where: {
        deletedAt: null,
        ...(serverId ? { id: serverId } : {}),
        ...(subscriptionId ? { subscriptionId } : {}),
      },
      include: { node: true },
    });

    for (const server of servers) {
      try {
        if (action === 'suspend') {
          // Force-stop the workload, then flag suspended.
          await this.agent.power(server.node, server.id, 'kill').catch(() => undefined);
          await this.prisma.server.update({
            where: { id: server.id },
            data: { state: 'SUSPENDED', suspendedAt: new Date() },
          });
          this.logger.log(`suspended ${server.id} (${reason ?? 'n/a'})`);
        } else {
          await this.prisma.server.update({
            where: { id: server.id },
            data: { state: 'OFFLINE', suspendedAt: null },
          });
          this.logger.log(`unsuspended ${server.id}`);
        }
      } catch (err) {
        this.logger.error(
          `suspension ${action} failed for ${server.id}: ${(err as Error).message}`,
        );
        throw err;
      }
    }
  }
}
