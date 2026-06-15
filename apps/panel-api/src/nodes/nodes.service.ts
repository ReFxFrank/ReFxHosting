import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Node } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7 } from '../common/util/uuid';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import {
  CreateNodeDto,
  HeartbeatDto,
  NodeRegisterDto,
  UpdateNodeDto,
} from './dto/node.dto';

@Injectable()
export class NodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async create(dto: CreateNodeDto): Promise<{ node: Node; bootstrapToken: string }> {
    const bootstrapToken = this.crypto.token(32);
    const node = await this.prisma.node.create({
      data: {
        id: uuidv7(),
        name: dto.name,
        fqdn: dto.fqdn,
        regionId: dto.regionId,
        os: dto.os,
        // We store the SHA-256 of the bootstrap token; the agent is provisioned
        // with the same value as its HMAC signing secret (see NodeAgentClient).
        tokenHash: this.crypto.hash(bootstrapToken),
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        daemonPort: dto.daemonPort ?? 8443,
        sftpPort: dto.sftpPort ?? 2022,
        state: 'PROVISIONING',
      },
    });
    return { node, bootstrapToken };
  }

  async list(pagination: PaginationDto): Promise<Paginated<Node>> {
    const where = { deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.node.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.node.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async get(id: string): Promise<Node> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException('Node not found');
    return node;
  }

  update(id: string, dto: UpdateNodeDto): Promise<Node> {
    return this.prisma.node.update({ where: { id }, data: dto });
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
  async pickNodeFor(limits: {
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
  }): Promise<Node | null> {
    const candidates = await this.prisma.node.findMany({
      where: { deletedAt: null, state: 'ONLINE', maintenance: false },
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
