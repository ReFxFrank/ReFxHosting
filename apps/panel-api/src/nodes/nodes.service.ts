import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Node, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { NodeAgentClient } from '../agent/agent.client';
import { deriveSigningKey } from '../agent/agent.signing';
import { isJavaImage, resolveJavaImage } from '../common/util/java-version.util';
import { uuidv7 } from '../common/util/uuid';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import {
  PORT_RANGE_START,
  PORT_RANGE_END,
} from '../servers/allocation-port.util';
import {
  CreateNodeDto,
  HeartbeatDto,
  NodeRegisterDto,
  UpdateNodeDto,
} from './dto/node.dto';

/** Loose UUID shape check (any version), used to avoid Prisma P2023 on bad ids. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

@Injectable()
export class NodesService {
  private readonly secretsEncKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly agent: NodeAgentClient,
    config: ConfigService,
  ) {
    this.secretsEncKey = config.get<string>('secretsEncKey')!;
  }

  private readonly regionSelect = {
    id: true,
    code: true,
    name: true,
    country: true,
  } as const;

  /** All regions (locations), for the admin Locations view + node-create picker. */
  listRegions() {
    return this.prisma.region.findMany({
      select: this.regionSelect,
      orderBy: { name: 'asc' },
    });
  }

  /** Create a location/region. Codes are unique (used as the human handle). */
  async createRegion(dto: { code: string; name: string; country: string }) {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.prisma.region.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`A location with code "${code}" already exists`);
    }
    return this.prisma.region.create({
      data: { id: uuidv7(), code, name: dto.name.trim(), country: dto.country.trim() },
      select: this.regionSelect,
    });
  }

  async updateRegion(
    id: string,
    dto: { code?: string; name?: string; country?: string },
  ) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Location not found');
    const data: { code?: string; name?: string; country?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.country !== undefined) data.country = dto.country.trim();
    if (dto.code !== undefined) {
      const code = dto.code.trim().toLowerCase();
      const clash = await this.prisma.region.findFirst({
        where: { code, id: { not: id } },
      });
      if (clash) {
        throw new BadRequestException(`A location with code "${code}" already exists`);
      }
      data.code = code;
    }
    return this.prisma.region.update({
      where: { id },
      data,
      select: this.regionSelect,
    });
  }

  async deleteRegion(id: string): Promise<void> {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException('Location not found');

    // Active nodes block deletion — move or delete them first.
    const active = await this.prisma.node.count({
      where: { regionId: id, deletedAt: null },
    });
    if (active > 0) {
      throw new BadRequestException(
        'Cannot delete a location that still has nodes; move or delete them first',
      );
    }

    // Only soft-deleted ("removed") nodes remain. They still hold the
    // non-nullable regionId FK, so the region delete would otherwise fail. Purge
    // them here (their heartbeats + allocations cascade at the DB level), then
    // delete the region — all in one transaction so it's all-or-nothing.
    try {
      await this.prisma.$transaction([
        this.prisma.node.deleteMany({ where: { regionId: id } }),
        this.prisma.region.delete({ where: { id } }),
      ]);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        // A removed node still has servers attached (Server→Node is RESTRICT).
        throw new BadRequestException(
          'A removed node in this location still has servers attached — delete those servers first.',
        );
      }
      throw e;
    }
  }

  /**
   * Resolve a region reference that may be either the UUID `id` or the unique
   * `code` (e.g. "us-east"). Throws a clean 400 rather than letting an invalid
   * UUID surface as Prisma's cryptic P2023 ("inconsistent column data").
   */
  private async resolveRegionId(ref: string): Promise<string> {
    const region = await this.prisma.region.findFirst({
      where: { OR: [{ code: ref }, ...(isUuid(ref) ? [{ id: ref }] : [])] },
      select: { id: true },
    });
    if (!region) {
      throw new BadRequestException(
        `Unknown region "${ref}". Pick an existing region.`,
      );
    }
    return region.id;
  }

  async create(dto: CreateNodeDto): Promise<{ node: Node; bootstrapToken: string }> {
    const bootstrapToken = this.crypto.token(32);
    const regionId = await this.resolveRegionId(dto.regionId);
    const portStart = dto.allocationPortStart ?? PORT_RANGE_START;
    const portEnd = dto.allocationPortEnd ?? PORT_RANGE_END;
    if (portStart > portEnd) {
      throw new BadRequestException(
        'allocationPortStart must be <= allocationPortEnd',
      );
    }
    const node = await this.prisma.node.create({
      data: {
        id: uuidv7(),
        name: dto.name,
        fqdn: dto.fqdn,
        regionId,
        os: dto.os,
        // We store the SHA-256 of the bootstrap token; the agent is provisioned
        // with the same value as its HMAC signing secret (see NodeAgentClient).
        tokenHash: this.crypto.hash(bootstrapToken),
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        daemonPort: dto.daemonPort ?? 8443,
        sftpPort: dto.sftpPort ?? 2022,
        allocationPortStart: portStart,
        allocationPortEnd: portEnd,
        state: 'PROVISIONING',
      },
    });
    return { node, bootstrapToken };
  }

  /**
   * Shape returned to the admin UI: the Node row plus its region (name +
   * country) and the single most-recent NodeHeartbeat. The UI renders gauges
   * from the heartbeat against the node's advertised capacity.
   */
  private readonly adminNodeInclude = {
    region: { select: { id: true, code: true, name: true, country: true } },
    heartbeats: {
      orderBy: { recordedAt: 'desc' as const },
      take: 1,
    },
  };

  /** Flatten the `heartbeats` array into a single `latestHeartbeat` field. */
  private decorate<
    T extends { heartbeats?: { recordedAt: Date }[] },
  >(node: T) {
    const { heartbeats, ...rest } = node;
    return { ...rest, latestHeartbeat: heartbeats?.[0] ?? null };
  }

  async list(pagination: PaginationDto): Promise<Paginated<unknown>> {
    const where = { deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.node.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: this.adminNodeInclude,
      }),
      this.prisma.node.count({ where }),
    ]);
    return paginate(data.map((n) => this.decorate(n)), total, pagination);
  }

  async get(id: string): Promise<Node> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
      include: this.adminNodeInclude,
    });
    if (!node) throw new NotFoundException('Node not found');
    return this.decorate(node) as unknown as Node;
  }

  /**
   * Measure panel -> agent round-trip latency by hitting a cheap agent endpoint
   * (its `/api/v1/system` status route). Returns the elapsed milliseconds and a
   * `reachable` flag; on timeout / connection failure `reachable` is false.
   */
  async ping(id: string): Promise<{ ms: number | null; reachable: boolean }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException('Node not found');
    const started = Date.now();
    try {
      await this.agent.fetchAgentStatus(node);
      return { ms: Date.now() - started, reachable: true };
    } catch {
      return { ms: null, reachable: false };
    }
  }

  /**
   * Ask the node's agent to restart itself in place. Game servers keep running
   * and are re-adopted when the agent comes back. Does NOT power-cycle the host.
   */
  async restartAgent(id: string): Promise<{ restarting: true }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException('Node not found');
    await this.agent.restartAgent(node);
    return { restarting: true };
  }

  async update(id: string, dto: UpdateNodeDto): Promise<Node> {
    if (
      dto.allocationPortStart != null &&
      dto.allocationPortEnd != null &&
      dto.allocationPortStart > dto.allocationPortEnd
    ) {
      throw new BadRequestException(
        'allocationPortStart must be <= allocationPortEnd',
      );
    }
    const data: UpdateNodeDto = { ...dto };
    if (data.fqdn !== undefined) data.fqdn = data.fqdn.trim();
    try {
      return await this.prisma.node.update({ where: { id }, data });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('Another node already uses that FQDN');
      }
      throw e;
    }
  }

  setMaintenance(id: string, on: boolean): Promise<Node> {
    return this.prisma.node.update({
      where: { id },
      data: { maintenance: on, state: on ? 'MAINTENANCE' : 'ONLINE' },
    });
  }

  async delete(id: string): Promise<void> {
    const servers = await this.prisma.server.count({
      where: { nodeId: id, deletedAt: null },
    });
    if (servers > 0) {
      throw new BadRequestException(
        'Cannot delete a node that still has servers; migrate them first',
      );
    }
    await this.prisma.node.update({
      where: { id },
      data: { deletedAt: new Date(), state: 'OFFLINE' },
    });
  }

  /** Re-issue a bootstrap token for an existing node (rotation). */
  async regenerateBootstrap(id: string): Promise<{ bootstrapToken: string }> {
    const bootstrapToken = this.crypto.token(32);
    await this.prisma.node.update({
      where: { id },
      data: { tokenHash: this.crypto.hash(bootstrapToken) },
    });
    return { bootstrapToken };
  }

  /**
   * Capacity tracking: sum of provisioned server limits vs advertised capacity,
   * applying overcommit ratios. Used by the scheduler when placing new servers.
   */
  async capacity(id: string) {
    const node = await this.get(id);
    const agg = await this.prisma.server.aggregate({
      where: { nodeId: id, deletedAt: null },
      _sum: { cpuCores: true, memoryMb: true, diskMb: true },
    });
    const usedCpu = agg._sum.cpuCores ?? 0;
    const usedMem = agg._sum.memoryMb ?? 0;
    const usedDisk = agg._sum.diskMb ?? 0;
    return {
      cpu: {
        total: node.cpuCores * node.cpuOvercommit,
        used: usedCpu,
        free: node.cpuCores * node.cpuOvercommit - usedCpu,
      },
      memory: {
        total: node.memoryMb * node.memOvercommit,
        used: usedMem,
        free: node.memoryMb * node.memOvercommit - usedMem,
      },
      disk: { total: node.diskMb, used: usedDisk, free: node.diskMb - usedDisk },
    };
  }

  /**
   * Pick the least-loaded ONLINE, non-maintenance node with enough free
   * capacity for the requested limits. Returns null when none fit.
   */
  async pickNodeFor(
    limits: {
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
    },
    regionId?: string,
  ): Promise<Node | null> {
    const candidates = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        state: 'ONLINE',
        maintenance: false,
        ...(regionId ? { regionId } : {}),
      },
    });
    let best: { node: Node; score: number } | null = null;
    for (const node of candidates) {
      const cap = await this.capacity(node.id);
      if (
        cap.cpu.free >= limits.cpuCores &&
        cap.memory.free >= limits.memoryMb &&
        cap.disk.free >= limits.diskMb
      ) {
        // Lower memory utilization wins.
        const score = cap.memory.used / Math.max(1, cap.memory.total);
        if (!best || score < best.score) best = { node, score };
      }
    }
    return best?.node ?? null;
  }

  /**
   * Regions that currently have at least one ONLINE, non-maintenance node with
   * enough free capacity for `limits`. Powers the storefront location picker so
   * customers only see places their order can actually be provisioned.
   */
  async regionsWithCapacity(limits: {
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
  }): Promise<Array<{ id: string; code: string; name: string; country: string }>> {
    const regions = await this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, country: true },
    });
    const nodes = await this.prisma.node.findMany({
      where: { deletedAt: null, state: 'ONLINE', maintenance: false },
      select: { id: true, regionId: true },
    });

    const out: Array<{ id: string; code: string; name: string; country: string }> = [];
    for (const region of regions) {
      const regionNodes = nodes.filter((n) => n.regionId === region.id);
      let fits = false;
      for (const n of regionNodes) {
        const cap = await this.capacity(n.id);
        if (
          cap.cpu.free >= limits.cpuCores &&
          cap.memory.free >= limits.memoryMb &&
          cap.disk.free >= limits.diskMb
        ) {
          fits = true;
          break;
        }
      }
      if (fits) out.push(region);
    }
    return out;
  }

  /**
   * Human-readable explanation of why no node fit a placement request. The
   * scheduler reserves each server's PROVISIONED resources against a node's
   * CONFIGURED capacity (cpuCores/memoryMb/diskMb on the node) — which is
   * independent of live host telemetry — so this points at the real constraint.
   */
  async capacityShortfall(
    limits: {
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
    },
    regionId?: string,
  ): Promise<string> {
    const candidates = await this.prisma.node.findMany({
      where: { deletedAt: null, ...(regionId ? { regionId } : {}) },
    });
    const online = candidates.filter(
      (n) => n.state === 'ONLINE' && !n.maintenance,
    );
    const needs = `Plan reserves ${limits.cpuCores} vCPU / ${limits.memoryMb} MB RAM / ${limits.diskMb} MB disk.`;

    if (candidates.length === 0) return `${needs} No nodes exist yet.`;
    if (online.length === 0) {
      return `${needs} No nodes are ONLINE and out of maintenance.`;
    }

    // Report the most-free node so the operator can see the gap.
    let bestLine = '';
    let bestFree = -Infinity;
    for (const node of online) {
      const cap = await this.capacity(node.id);
      const freeScore = Math.min(
        cap.cpu.free / Math.max(1, limits.cpuCores),
        cap.memory.free / Math.max(1, limits.memoryMb),
        cap.disk.free / Math.max(1, limits.diskMb),
      );
      if (freeScore > bestFree) {
        bestFree = freeScore;
        bestLine =
          `Closest node "${node.name}" has ${cap.cpu.free} vCPU / ` +
          `${cap.memory.free} MB RAM / ${cap.disk.free} MB disk free.`;
      }
    }
    return `${needs} ${bestLine} Raise the node's capacity in Admin → Nodes (Edit), or lower the plan's resources.`;
  }

  /**
   * Heartbeat history for a node within a relative range ("1h" | "6h" | "24h" |
   * "7d"), newest first. Powers the admin node detail graphs.
   */
  async listHeartbeats(id: string, range = '1h'): Promise<unknown[]> {
    await this.get(id);
    const ms = this.rangeToMs(range);
    const since = new Date(Date.now() - ms);
    return this.prisma.nodeHeartbeat.findMany({
      where: { nodeId: id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      take: 5000,
    });
  }

  private rangeToMs(range: string): number {
    const map: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };
    return map[range] ?? map['1h'];
  }

  // ---- agent-facing endpoints --------------------------------------------

  /**
   * Token-only registration: the agent presents its bootstrap token (no node id
   * in the URL). We resolve the Node by tokenHash, mark it ONLINE, and hand back
   * the durable identity, the per-node signing key, and the install specs for
   * every server already assigned to this node.
   *
   * The signing key is derived deterministically (sha256hex(SECRETS_ENC_KEY +
   * ":" + nodeId)) so it never has to be persisted — the panel recomputes it on
   * every signed callback (see AgentSignatureGuard / agent.signing.ts).
   */
  async registerAgentByToken(dto: {
    bootstrapToken: string;
    agentVersion?: string;
    capabilities?: unknown;
  }) {
    const tokenHash = this.crypto.hash(dto.bootstrapToken);
    const node = await this.prisma.node.findFirst({
      where: { tokenHash, deletedAt: null },
    });
    if (!node) throw new BadRequestException('Invalid bootstrap token');

    await this.prisma.node.update({
      where: { id: node.id },
      data: {
        state: 'ONLINE',
        agentVersion: dto.agentVersion ?? node.agentVersion,
      },
    });

    const servers = await this.buildServerInstallSpecs(node.id);

    return {
      nodeId: node.id,
      signingKey: this.deriveSigningKey(node.id),
      servers,
      settings: {
        name: node.name,
        os: node.os,
        sftpPort: node.sftpPort,
        daemonPort: node.daemonPort,
        // TODO(impl): include S3 backup creds, network config, log shipping URL.
      },
    };
  }

  /**
   * Per-node signing key, derived deterministically from the global secrets key.
   * Mirrors deriveSigningKey() in agent.signing.ts byte-for-byte (the panel and
   * agent must agree); kept here so callers without the crypto util can reuse it.
   */
  deriveSigningKey(nodeId: string): string {
    return deriveSigningKey(this.secretsEncKey, nodeId);
  }

  /**
   * Build the wire-format ServerInstallSpec list for every (non-deleted) server
   * assigned to a node. Shape matches packages/shared ServerInstallSpec and the
   * Go agent's panel.ServerInstallSpec (camelCase JSON).
   */
  async buildServerInstallSpecs(nodeId: string) {
    const servers = await this.prisma.server.findMany({
      where: { nodeId, deletedAt: null },
      include: {
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });

    return servers.map((server) => {
      const template = server.template;

      const env: Record<string, string> = {};
      if (template) {
        for (const v of template.variables) {
          if (v.defaultValue != null) env[v.envName] = v.defaultValue;
        }
      }
      const serverEnv = (server.environment ?? {}) as Record<string, unknown>;
      for (const [k, val] of Object.entries(serverEnv)) env[k] = String(val);
      for (const ov of server.variables) env[ov.envName] = ov.value;

      let sftpPassword = '';
      if (server.sftpPasswordEnc) {
        try {
          sftpPassword = this.crypto.decrypt(server.sftpPasswordEnc);
        } catch {
          sftpPassword = '';
        }
      }

      // Auto-correct the JVM for Minecraft servers from the resolved
      // MINECRAFT_VERSION (handles servers created before this image, and
      // "latest" pins). The agent runs the install script in this image too, so
      // install + runtime share one compatible JVM. Non-Java images untouched.
      let dockerImage = server.dockerImage ?? '';
      if (isJavaImage(dockerImage)) {
        dockerImage =
          resolveJavaImage(dockerImage, env['MINECRAFT_VERSION'], 'jre') ??
          dockerImage;
      }

      return {
        serverId: server.id,
        shortId: server.shortId,
        deployMethod: server.deployMethod,
        dockerImage,
        startupCommand: server.startupCommand ?? template?.startupCommand ?? '',
        startupDetect: template?.startupDetect ?? '',
        stopCommand: template?.stopCommand ?? '',
        environment: env,
        limits: {
          cpuCores: server.cpuCores,
          memoryMb: server.memoryMb,
          swapMb: server.swapMb,
          diskMb: server.diskMb,
          ioWeight: server.ioWeight,
        },
        allocations: server.allocations.map((a) => ({
          ip: a.ip,
          port: a.port,
          isPrimary: a.isPrimary,
        })),
        installScript: template?.installScript ?? {},
        configFiles: template?.configFiles ?? [],
        preserveData: true,
        sftpUsername: server.shortId,
        sftpPassword,
      };
    });
  }

  /** The agent calls this with its bootstrap token to register & get config. */
  async registerAgent(nodeId: string, dto: NodeRegisterDto) {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node || node.tokenHash !== this.crypto.hash(dto.bootstrapToken)) {
      throw new BadRequestException('Invalid bootstrap token');
    }
    const updated = await this.prisma.node.update({
      where: { id: nodeId },
      data: {
        state: 'ONLINE',
        agentVersion: dto.agentVersion ?? node.agentVersion,
      },
    });
    return {
      nodeId: updated.id,
      name: updated.name,
      os: updated.os,
      sftpPort: updated.sftpPort,
      daemonPort: updated.daemonPort,
      // Scoped, denormalized config the agent needs. Full server manifests are
      // delivered per-install via the agent install endpoint.
      // TODO(impl): include S3 backup creds, network config, log shipping URL.
    };
  }

  async ingestHeartbeat(nodeId: string, dto: HeartbeatDto): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.nodeHeartbeat.create({
        data: {
          id: uuidv7(),
          nodeId,
          cpuPct: dto.cpuPct,
          memUsedMb: dto.memUsedMb,
          diskUsedMb: dto.diskUsedMb,
          netRxBytes: BigInt(dto.netRxBytes),
          netTxBytes: BigInt(dto.netTxBytes),
          containers: dto.containers,
        },
      }),
      this.prisma.node.update({
        where: { id: nodeId },
        data: {
          state: 'ONLINE',
          agentVersion: dto.agentVersion ?? undefined,
        },
      }),
    ]);
  }
}
