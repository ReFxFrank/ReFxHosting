import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Backup, Node, Server } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';
import { uuidv7 } from '../common/util/uuid';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import { BackupJob, JOB, QUEUE } from '../queues/queue.constants';
import { CreateBackupDto } from './dto/backups.dto';

/** Max non-failed backups a single server may hold (disk + job-flood guard). */
const MAX_BACKUPS_PER_SERVER = 25;

/**
 * Server backups. Backup rows are the source of truth for state; the actual
 * archive/upload/restore/delete happens on the node-agent. Creation enqueues a
 * BackupJob (shared with the existing BackupsProcessor) so the agent call and
 * retry/backoff are handled off the request path.
 */
@Injectable()
export class BackupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    @InjectQueue(QUEUE.BACKUPS) private readonly backupQueue: Queue,
  ) {}

  private async serverWithNode(
    serverId: string,
  ): Promise<Server & { node: Node }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  private async backupOrThrow(
    serverId: string,
    backupId: string,
  ): Promise<Backup> {
    const backup = await this.prisma.backup.findFirst({
      where: { id: backupId, serverId },
    });
    if (!backup) throw new NotFoundException('Backup not found');
    return backup;
  }

  async list(
    serverId: string,
    pagination: PaginationDto,
  ): Promise<Paginated<Backup>> {
    await this.serverWithNode(serverId);
    const where = { serverId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.backup.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.backup.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async create(serverId: string, dto: CreateBackupDto): Promise<Backup> {
    await this.serverWithNode(serverId);
    // Cap backups per server to bound disk use and queued backup jobs — without
    // this a client can enqueue unbounded backups (disk exhaustion / job flood).
    const existing = await this.prisma.backup.count({
      where: { serverId, state: { not: 'FAILED' } },
    });
    if (existing >= MAX_BACKUPS_PER_SERVER) {
      throw new ConflictException(
        `Backup limit reached (${MAX_BACKUPS_PER_SERVER}). Delete an existing backup before creating another.`,
      );
    }
    const backup = await this.prisma.backup.create({
      data: {
        id: uuidv7(),
        serverId,
        name: dto.name,
        state: 'PENDING',
        ignoredFiles: dto.ignoredFiles ?? [],
      },
    });
    // Off-load the agent call to the existing backups worker.
    await this.backupQueue.add(JOB.RUN_BACKUP, {
      serverId,
      backupId: backup.id,
    } satisfies BackupJob);
    return backup;
  }

  async remove(serverId: string, backupId: string): Promise<void> {
    const server = await this.serverWithNode(serverId);
    await this.backupOrThrow(serverId, backupId);
    await this.agent.deleteBackup(server.node, serverId, backupId);
    await this.prisma.backup.delete({ where: { id: backupId } });
  }

  async restore(
    serverId: string,
    backupId: string,
  ): Promise<{ accepted: true }> {
    const server = await this.serverWithNode(serverId);
    const backup = await this.backupOrThrow(serverId, backupId);
    if (backup.state !== 'COMPLETED') {
      throw new NotFoundException('Backup is not ready to restore');
    }
    await this.agent.restoreBackup(server.node, serverId, backupId);
    return { accepted: true };
  }

  async downloadUrl(
    serverId: string,
    backupId: string,
  ): Promise<{ url: string }> {
    const server = await this.serverWithNode(serverId);
    await this.backupOrThrow(serverId, backupId);
    return this.agent.backupDownloadUrl(server.node, serverId, backupId);
  }
}
