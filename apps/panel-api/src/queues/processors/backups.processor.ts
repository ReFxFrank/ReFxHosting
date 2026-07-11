import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NodeAgentClient } from '../../agent/agent.client';
import { BackupJob, JOB, QUEUE } from '../queue.constants';

/**
 * Triggers a backup on the node agent and tracks state. The agent performs the
 * archive + upload asynchronously and reports completion via a callback/heartbeat
 * which marks the Backup COMPLETED (see NodesController agent endpoints).
 */
@Processor(QUEUE.BACKUPS)
export class BackupsProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {
    super();
  }

  async process(job: Job<BackupJob>): Promise<void> {
    if (job.name !== JOB.RUN_BACKUP) return;
    const { serverId, backupId } = job.data;

    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });
    const backup = await this.prisma.backup.findUnique({ where: { id: backupId } });
    if (!server || !backup) {
      this.logger.warn(`backup ${backupId} or server ${serverId} missing`);
      return;
    }

    await this.prisma.backup.update({
      where: { id: backupId },
      data: { state: 'IN_PROGRESS' },
    });

    try {
      await this.agent.createBackup(
        server.node,
        serverId,
        backupId,
        backup.ignoredFiles,
        backup.storage,
      );
      // TODO(impl): the agent reports final size/checksum/location on completion;
      // mark COMPLETED there. Left IN_PROGRESS here pending that callback.
    } catch (err) {
      await this.prisma.backup.update({
        where: { id: backupId },
        data: { state: 'FAILED', error: (err as Error).message },
      });
      throw err;
    }
  }
}
