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
import { SettingsService } from '../platform/settings.service';

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
    private readonly settings: SettingsService,
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
        // Express servers store offsite (S3/R2, presigned direct downloads);
        // everyone else uses the node's local disk. The agent confirms the
        // storage it actually used in the completion callback.
        storage: server.expressBackups ? 'S3' : 'LOCAL',
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

  /**
   * Fleet-wide backup storage statistics for the admin dashboard: how much
   * offsite (R2/S3) storage the fleet uses and what it costs vs what the
   * Express add-on earns, plus where local backups weigh on node disks.
   * Computed entirely from our own Backup rows — provider-agnostic and free
   * (no object-storage API calls).
   */
  async adminStats() {
    // Cloudflare R2 storage rate: $0.015/GB-month = 1.5 minor units. Egress is
    // free on R2, so storage-at-rest IS the cost estimate (ops are pennies).
    const OFFSITE_COST_MINOR_PER_GB_MONTH = 1.5;

    const [offsite, local, topRaw, localRows, expressSubs, expressServers, cfg] =
      await Promise.all([
        this.prisma.backup.aggregate({
          where: { storage: 'S3', state: 'COMPLETED' },
          _sum: { sizeBytes: true },
          _count: { _all: true },
        }),
        this.prisma.backup.aggregate({
          where: { storage: 'LOCAL', state: 'COMPLETED' },
          _sum: { sizeBytes: true },
          _count: { _all: true },
        }),
        this.prisma.backup.groupBy({
          by: ['serverId'],
          where: { storage: 'S3', state: 'COMPLETED' },
          _sum: { sizeBytes: true },
          _count: { _all: true },
          orderBy: { _sum: { sizeBytes: 'desc' } },
          take: 8,
        }),
        this.prisma.backup.findMany({
          where: { storage: 'LOCAL', state: 'COMPLETED' },
          select: {
            sizeBytes: true,
            server: {
              select: { nodeId: true, node: { select: { name: true } } },
            },
          },
        }),
        this.prisma.subscription.count({
          where: { expressBackups: true, state: { in: ['ACTIVE', 'TRIALING'] } },
        }),
        this.prisma.server.count({
          where: { expressBackups: true, deletedAt: null },
        }),
        this.settings.expressBackupsConfig(),
      ]);

    const offsiteBytes = Number(offsite._sum.sizeBytes ?? 0n);
    const localBytes = Number(local._sum.sizeBytes ?? 0n);
    const estMonthlyCostMinor = Math.round(
      (offsiteBytes / 1e9) * OFFSITE_COST_MINOR_PER_GB_MONTH,
    );
    const monthlyRevenueMinor = expressSubs * cfg.monthlyMinor;

    // Top offsite consumers, labeled. "paying" keys on the SUBSCRIPTION's
    // add-on flag, not the server's storage flag — so manually-comped servers
    // (storage granted, nothing billed) are visibly flagged in the table.
    const servers = await this.prisma.server.findMany({
      where: { id: { in: topRaw.map((t) => t.serverId) } },
      select: {
        id: true,
        shortId: true,
        name: true,
        node: { select: { name: true } },
        subscription: { select: { expressBackups: true } },
      },
    });
    const byId = new Map(servers.map((sv) => [sv.id, sv]));
    const topOffsite = topRaw.map((t) => ({
      serverId: t.serverId,
      shortId: byId.get(t.serverId)?.shortId ?? '?',
      name: byId.get(t.serverId)?.name ?? 'deleted server',
      nodeName: byId.get(t.serverId)?.node?.name ?? '—',
      paying: byId.get(t.serverId)?.subscription?.expressBackups ?? false,
      backups: t._count._all,
      bytes: Number(t._sum.sizeBytes ?? 0n),
    }));

    // Local backup weight per node (these live on the node's own disk).
    const perNode = new Map<
      string,
      { nodeId: string; nodeName: string; backups: number; bytes: number }
    >();
    for (const row of localRows) {
      const nodeId = row.server.nodeId;
      const entry = perNode.get(nodeId) ?? {
        nodeId,
        nodeName: row.server.node?.name ?? nodeId,
        backups: 0,
        bytes: 0,
      };
      entry.backups += 1;
      entry.bytes += Number(row.sizeBytes);
      perNode.set(nodeId, entry);
    }

    return {
      offsite: {
        bytes: offsiteBytes,
        backups: offsite._count._all,
        estMonthlyCostMinor,
      },
      local: {
        bytes: localBytes,
        backups: local._count._all,
        perNode: [...perNode.values()].sort((a, b) => b.bytes - a.bytes),
      },
      express: {
        payingSubscriptions: expressSubs,
        serversWithExpress: expressServers,
        monthlyFeeMinor: cfg.monthlyMinor,
        monthlyRevenueMinor,
        marginMinor: monthlyRevenueMinor - estMonthlyCostMinor,
      },
      topOffsite,
      panelDb: await this.panelDbBackupStats(),
    };
  }

  /**
   * Usage of the panel's own Postgres backup bucket (the encrypted pg_dumps the
   * infra/scripts/backup-panel-db.sh cron ships to R2). These objects aren't in
   * our DB — they're written by a shell script — so we list the bucket directly
   * with a signed, read-only ListObjectsV2. Config comes from the same .env the
   * script uses (S3_* + PANEL_BACKUP_*), which the container receives via
   * env_file. Best-effort: any misconfig or R2 error returns configured:false
   * with a reason rather than breaking the storage overview.
   */
  async panelDbBackupStats(): Promise<{
    configured: boolean;
    reason?: string;
    bucket?: string;
    prefix?: string;
    backups?: number;
    bytes?: number;
    estMonthlyCostMinor?: number;
    latestKey?: string;
    latestModified?: string;
    /** True when the newest dump is under ~36h old (nightly cron is healthy). */
    latestFresh?: boolean;
  }> {
    const env = process.env;
    const bucket = env.PANEL_BACKUP_BUCKET || env.S3_BUCKET || '';
    const endpoint = env.S3_ENDPOINT || '';
    const accessKey = env.S3_ACCESS_KEY || '';
    const secretKey = env.S3_SECRET_KEY || '';
    const prefix = (env.PANEL_BACKUP_PREFIX || 'panel-postgres') + '/';

    if (!bucket || !endpoint || !accessKey || !secretKey) {
      return {
        configured: false,
        reason:
          'Panel-DB backup storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / PANEL_BACKUP_BUCKET in the panel .env).',
      };
    }
    // MinIO dev default — not a real offsite target; don't present it as one.
    if (/minio:9000|localhost/.test(endpoint)) {
      return {
        configured: false,
        reason: `Panel-DB backups point at a local endpoint (${endpoint}), not offsite R2/S3.`,
      };
    }

    try {
      const { listObjects } = await import('../common/s3-lite');
      const { objects, totalBytes } = await listObjects(
        {
          endpoint,
          region: env.S3_REGION || 'auto',
          bucket,
          accessKey,
          secretKey,
          usePathStyle: (env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
        },
        prefix,
      );
      const dumps = objects.filter((o) => o.key.endsWith('.dump.enc'));
      const latest = dumps.reduce<(typeof dumps)[number] | undefined>(
        (acc, o) => (!acc || o.lastModified > acc.lastModified ? o : acc),
        undefined,
      );
      // R2 storage: $0.015/GB-month = 1.5 minor units per GB (egress free).
      const estMonthlyCostMinor = Math.round((totalBytes / 1e9) * 1.5);
      const latestFresh = latest
        ? Date.now() - new Date(latest.lastModified).getTime() <
          36 * 3600 * 1000
        : false;
      return {
        configured: true,
        bucket,
        prefix,
        backups: dumps.length,
        bytes: totalBytes,
        estMonthlyCostMinor,
        latestKey: latest?.key,
        latestModified: latest?.lastModified,
        latestFresh,
      };
    } catch (err) {
      const detail = (err as Error).message;
      this.logger.warn(`panel-DB backup stats unavailable: ${detail}`);
      const hint = /AccessDenied|403/.test(detail)
        ? ' The R2 token can read/write objects but not list the bucket — give it "Admin Read & Write" (or add s3:ListBucket) in Cloudflare.'
        : '';
      return {
        configured: false,
        bucket,
        prefix,
        reason: `Could not list ${bucket}: ${detail}.${hint}`,
      };
    }
  }
}
