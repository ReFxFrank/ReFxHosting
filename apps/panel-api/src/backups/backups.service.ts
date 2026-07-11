import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { Backup, Node, Server } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgentByteStream, NodeAgentClient } from '../agent/agent.client';
import { uuidv7 } from '../common/util/uuid';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import { BackupJob, JOB, QUEUE } from '../queues/queue.constants';
import { CreateBackupDto } from './dto/backups.dto';
import { essentialExcludes, mergeExcludes } from './backup-profiles.util';

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
  private readonly logger = new Logger(BackupsService.name);
  /** Signed download links live this long — minted per click. */
  private static readonly DOWNLOAD_TTL_SECONDS = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE.BACKUPS) private readonly backupQueue: Queue,
  ) {}

  /** HMAC key for signed backup downloads (derived from the secrets key). */
  private downloadKey(): string {
    const key =
      this.config.get<string>('secretsEncKey') ??
      process.env.SECRETS_ENC_KEY ??
      '';
    if (!key) throw new BadRequestException('Downloads are not configured');
    return `backup-download:${key}`;
  }

  private downloadSig(serverId: string, backupId: string, exp: number): string {
    return createHmac('sha256', this.downloadKey())
      .update(`${serverId}\n${backupId}\n${exp}`)
      .digest('hex');
  }

  /**
   * Fail out backups that will never finish: the agent reports completion via
   * callback, so if it dies/restarts mid-archive the row would sit PENDING or
   * IN_PROGRESS forever (and count against the per-server backup cap). Six
   * hours is far beyond any realistic archive+upload.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async failStaleBackups(): Promise<number> {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const res = await this.prisma.backup.updateMany({
      where: {
        state: { in: ['PENDING', 'IN_PROGRESS'] },
        createdAt: { lt: cutoff },
      },
      data: {
        state: 'FAILED',
        error: 'Timed out — the node agent never reported completion.',
      },
    });
    if (res.count > 0) {
      this.logger.warn(`failed ${res.count} stale backup(s) (no completion callback)`);
    }
    return res.count;
  }

  private async serverWithNode(
    serverId: string,
  ): Promise<Server & { node: Node; template: { slug: string } | null }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, template: { select: { slug: true } } },
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
    const server = await this.serverWithNode(serverId);
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
    // ESSENTIALS: prepend the game's curated exclude profile (regenerable
    // content only) to whatever the user chose to skip. The final glob list is
    // persisted on the row, so the archive is self-describing.
    const ignoredFiles =
      dto.mode === 'ESSENTIALS'
        ? mergeExcludes(
            essentialExcludes(
              server.template?.slug,
              server.environment as Record<string, unknown> | null,
            ),
            dto.ignoredFiles,
          )
        : (dto.ignoredFiles ?? []);
    const backup = await this.prisma.backup.create({
      data: {
        id: uuidv7(),
        serverId,
        name: dto.name,
        state: 'PENDING',
        ignoredFiles,
      },
    });
    // Off-load the agent call to the existing backups worker.
    await this.backupQueue.add(JOB.RUN_BACKUP, {
      serverId,
      backupId: backup.id,
    } satisfies BackupJob);
    return backup;
  }

  /**
   * Create a backup on behalf of a schedule. Unlike interactive creation,
   * hitting the per-server cap must not wedge the schedule forever — rotate:
   * drop the oldest UNLOCKED completed backup to make room (locked backups
   * are exempt, as promised in the UI). Fails only when everything is locked.
   */
  async createScheduled(
    serverId: string,
    name: string,
    mode: 'ESSENTIALS' | 'FULL',
  ): Promise<Backup> {
    const count = await this.prisma.backup.count({
      where: { serverId, state: { not: 'FAILED' } },
    });
    if (count >= MAX_BACKUPS_PER_SERVER) {
      const oldest = await this.prisma.backup.findFirst({
        where: { serverId, isLocked: false, state: 'COMPLETED' },
        orderBy: { createdAt: 'asc' },
      });
      if (!oldest) {
        throw new ConflictException(
          'Backup limit reached and every backup is locked — nothing to rotate',
        );
      }
      this.logger.log(
        `rotating oldest backup ${oldest.id} on server ${serverId} for a scheduled backup`,
      );
      await this.remove(serverId, oldest.id);
    }
    return this.create(serverId, { name, mode });
  }

  async remove(serverId: string, backupId: string): Promise<void> {
    const server = await this.serverWithNode(serverId);
    const backup = await this.backupOrThrow(serverId, backupId);
    if (backup.isLocked) {
      throw new ConflictException('Backup is locked — unlock it first');
    }
    // Only ask the agent to remove an archive that exists (failed/pending
    // backups never stored one), and treat agent failure as best-effort: the
    // DB row is the source of truth, and a dead node must not make a backup
    // undeletable. Stray archives are reconciled by rotation later.
    if (backup.location) {
      try {
        await this.agent.deleteBackup(
          server.node,
          serverId,
          backupId,
          backup.location,
        );
      } catch (e) {
        this.logger.warn(
          `agent archive delete failed for backup ${backupId} (${(e as Error).message}); removing row anyway`,
        );
      }
    }
    await this.prisma.backup.delete({ where: { id: backupId } });
  }

  /** Lock/unlock a backup (locked = protected from deletion/rotation). */
  async setLocked(
    serverId: string,
    backupId: string,
    isLocked: boolean,
  ): Promise<Backup> {
    await this.backupOrThrow(serverId, backupId);
    return this.prisma.backup.update({
      where: { id: backupId },
      data: { isLocked },
    });
  }

  async restore(
    serverId: string,
    backupId: string,
  ): Promise<{ accepted: true }> {
    const server = await this.serverWithNode(serverId);
    const backup = await this.backupOrThrow(serverId, backupId);
    if (backup.state !== 'COMPLETED' || !backup.location) {
      throw new NotFoundException('Backup is not ready to restore');
    }
    await this.agent.restoreBackup(
      server.node,
      serverId,
      backupId,
      backup.location,
    );
    return { accepted: true };
  }

  /**
   * Mint a short-lived signed URL for the browser (a new tab can't send the
   * JWT). The public archive route verifies the HMAC and relays the agent's
   * byte stream — same pattern as file downloads.
   */
  async downloadUrl(
    serverId: string,
    backupId: string,
  ): Promise<{ url: string }> {
    const server = await this.serverWithNode(serverId);
    const backup = await this.backupOrThrow(serverId, backupId);
    if (backup.state !== 'COMPLETED' || !backup.location) {
      throw new NotFoundException('Backup has no stored archive to download');
    }
    // Prefer a DIRECT download (S3 presigned GET): full object-storage
    // bandwidth and native resume, no node→panel relay. Local storage (and
    // pre-v1.5 agents, which echo a non-URL here) falls back to the panel-
    // signed relay below.
    try {
      const { url } = await this.agent.backupDownloadUrl(
        server.node,
        serverId,
        backupId,
        backup.location,
      );
      if (url && /^https?:\/\//i.test(url)) return { url };
    } catch {
      // Agent unreachable/legacy — the relay path below still works.
    }
    const exp =
      Math.floor(Date.now() / 1000) + BackupsService.DOWNLOAD_TTL_SECONDS;
    const sig = this.downloadSig(serverId, backupId, exp);
    return {
      url: `/servers/${serverId}/backups/${backupId}/archive?exp=${exp}&sig=${sig}`,
    };
  }

  /** Verify a signed download and return the agent byte stream + filename. */
  async openSignedDownload(
    serverId: string,
    backupId: string,
    expStr: string,
    sig: string,
    range?: string,
  ): Promise<AgentByteStream & { filename: string; sizeBytes: bigint }> {
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Download link expired');
    }
    const expected = this.downloadSig(serverId, backupId, exp);
    const a = Buffer.from(sig ?? '', 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid download signature');
    }
    const server = await this.serverWithNode(serverId);
    const backup = await this.backupOrThrow(serverId, backupId);
    if (backup.state !== 'COMPLETED' || !backup.location) {
      throw new NotFoundException('Backup has no stored archive');
    }
    let relayed: AgentByteStream;
    try {
      relayed = await this.agent.backupStream(
        server.node,
        serverId,
        backupId,
        backup.location,
        range,
      );
    } catch (e) {
      // An agent that predates the download endpoint answers with its
      // router's plain 404 — turn that into an actionable message.
      if ((e as Error).message?.includes('404')) {
        throw new ServiceUnavailableException(
          'This node agent does not support backup downloads yet — update the node agent (v1.4.2+) from the admin panel, then try again.',
        );
      }
      throw e;
    }
    const base = backup.name?.trim() || 'backup';
    return {
      ...relayed,
      filename: `${base}-${backupId.slice(0, 8)}.tar.gz`,
      sizeBytes: backup.sizeBytes,
    };
  }
}
