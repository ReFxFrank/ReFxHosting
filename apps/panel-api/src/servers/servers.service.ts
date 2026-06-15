import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, Server, ServerState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
import { uuidv7, shortId } from '../common/util/uuid';
import { Paginated, PaginationDto, paginate } from '../common/dto/pagination.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { NodesService } from '../nodes/nodes.service';
import { NodeAgentClient, PowerSignal } from '../agent/agent.client';
import {
  JOB,
  ProvisionJob,
  QUEUE,
  ReinstallJob,
} from '../queues/queue.constants';
import {
  CreateServerDto,
  ResizeServerDto,
  SwitchGameDto,
} from './dto/server.dto';
import { AdminCreateServerDto } from '../admin/dto/admin.dto';

/** Power signals that require the server to first be RUNNING/STARTING. */
const STOPPED_STATES: ServerState[] = ['OFFLINE', 'CRASHED'];

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly nodes: NodesService,
    private readonly agent: NodeAgentClient,
    @InjectQueue(QUEUE.PROVISIONING) private readonly provisionQueue: Queue,
    @InjectQueue(QUEUE.REINSTALL) private readonly reinstallQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
  ) {}

  // ---- read --------------------------------------------------------------

  async list(user: AuthUser, pagination: PaginationDto): Promise<Paginated<Server>> {
    const isAdmin = user.globalRole === 'ADMIN' || user.globalRole === 'OWNER';
    const where: Prisma.ServerWhereInput = {
      deletedAt: null,
      ...(isAdmin
        ? {}
        : {
            OR: [
              { ownerId: user.id },
              { subUsers: { some: { userId: user.id, state: 'ACTIVE' } } },
            ],
          }),
      ...(pagination.q ? { name: { contains: pagination.q, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: { template: true, node: { select: { name: true, fqdn: true } } },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async get(id: string): Promise<Server> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: {
        template: true,
        node: true,
        allocations: true,
        variables: true,
      },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  // ---- create / provision ------------------------------------------------

  async create(ownerId: string, dto: CreateServerDto): Promise<Server> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: dto.subscriptionId, userId: ownerId },
      include: { product: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.state !== 'ACTIVE' && subscription.state !== 'TRIALING') {
      throw new BadRequestException('Subscription is not active');
    }

    const template = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('Template not found');
    this.assertTemplateAllowed(subscription.product.allowedTemplateIds, dto.templateId);

    const limits = {
      cpuCores: subscription.product.cpuCores ?? template.recCpuCores,
      memoryMb: subscription.product.memoryMb ?? template.recMemoryMb,
      diskMb: subscription.product.diskMb ?? template.recDiskMb,
    };

    // Node placement: explicit or scheduled.
    let nodeId = dto.nodeId;
    if (!nodeId) {
      const node = await this.nodes.pickNodeFor(limits);
      if (!node) throw new ConflictException('No node has capacity for this plan');
      nodeId = node.id;
    }

    const dockerImage = this.firstDockerImage(template.dockerImages);

    const server = await this.prisma.server.create({
      data: {
        id: uuidv7(),
        shortId: shortId(),
        name: dto.name,
        description: dto.description,
        ownerId,
        nodeId,
        templateId: template.id,
        templateVersion: template.version,
        state: 'INSTALLING',
        deployMethod: (template.deployMethods[0] as any) ?? 'DOCKER',
        cpuCores: limits.cpuCores,
        memoryMb: limits.memoryMb,
        diskMb: limits.diskMb,
        slots: subscription.product.slots ?? null,
        startupCommand: template.startupCommand,
        dockerImage,
        environment: dto.environment ?? {},
        subscriptionId: subscription.id,
        sftpPasswordEnc: this.crypto.encrypt(this.crypto.token(16)),
      },
    });

    await this.provisionQueue.add(JOB.PROVISION, {
      serverId: server.id,
    } satisfies ProvisionJob);

    return server;
  }

  /**
   * Admin-driven server creation (Pterodactyl-style): provisions a server from
   * an egg directly for any owner, WITHOUT a billing subscription. Validates the
   * owner/node/template, writes the Server row (subscriptionId = null), and
   * enqueues provisioning identically to the customer `create()` path so the node
   * agent installs it.
   */
  async adminCreate(dto: AdminCreateServerDto): Promise<Server> {
    const owner = await this.prisma.user.findFirst({
      where: { id: dto.ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException('Owner not found');

    const node = await this.prisma.node.findFirst({
      where: { id: dto.nodeId, deletedAt: null },
      select: { id: true },
    });
    if (!node) throw new NotFoundException('Node not found');

    const template = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!template) throw new NotFoundException('Template not found');

    const dockerImage = this.firstDockerImage(template.dockerImages);

    const server = await this.prisma.server.create({
      data: {
        id: uuidv7(),
        shortId: shortId(),
        name: dto.name,
        ownerId: dto.ownerId,
        nodeId: dto.nodeId,
        templateId: template.id,
        templateVersion: template.version,
        state: 'INSTALLING',
        deployMethod: (template.deployMethods[0] as any) ?? 'DOCKER',
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        swapMb: dto.swapMb ?? 0,
        startupCommand: template.startupCommand,
        dockerImage,
        environment: dto.environment ?? {},
        subscriptionId: null,
        sftpPasswordEnc: this.crypto.encrypt(this.crypto.token(16)),
      },
    });

    await this.provisionQueue.add(JOB.PROVISION, {
      serverId: server.id,
    } satisfies ProvisionJob);

    return server;
  }

  /** Admin list of every (non-deleted) server with node/owner/template names. */
  async adminList(pagination: PaginationDto): Promise<Paginated<Server>> {
    const where: Prisma.ServerWhereInput = {
      deletedAt: null,
      ...(pagination.q
        ? { name: { contains: pagination.q, mode: 'insensitive' } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { id: true, name: true, slug: true } },
          node: { select: { id: true, name: true, fqdn: true } },
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  // ---- power -------------------------------------------------------------

  async power(id: string, signal: PowerSignal): Promise<{ accepted: true }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.state === 'SUSPENDED') {
      throw new ForbiddenException('Server is suspended');
    }
    if (server.state === 'INSTALLING' || server.state === 'REINSTALLING') {
      throw new ConflictException(`Cannot ${signal} while ${server.state}`);
    }

    await this.agent.power(server.node, server.id, signal);

    // Optimistic transition; the agent confirms the real state via heartbeat.
    const nextState: ServerState =
      signal === 'start'
        ? 'STARTING'
        : signal === 'restart'
          ? 'STARTING'
          : 'STOPPING';
    await this.prisma.server.update({
      where: { id },
      data: { state: nextState },
    });
    return { accepted: true };
  }

  // ---- GAME SWITCHING (signature feature) --------------------------------

  /**
   * Swap the game installed on a server while preserving its identity (shortId,
   * SFTP user, billing linkage, allocations). Orchestration:
   *   1. The server MUST be stopped (OFFLINE/CRASHED).
   *   2. The target template MUST be on the funding product's whitelist.
   *   3. Write a GameSwitchLog (audit of from -> to).
   *   4. Atomically repoint template/version/dockerImage/startupCommand/env and
   *      clear stale per-game ServerVariable overrides.
   *   5. Move the server into SWITCHING_GAME and queue a reinstall on the agent
   *      (which wipes or preserves the data volume per preserveData).
   */
  async switchGame(
    id: string,
    actorId: string,
    dto: SwitchGameDto,
  ): Promise<{ accepted: true; gameSwitchLogId: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true, subscription: { include: { product: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');

    // (1) Must be stopped.
    if (!STOPPED_STATES.includes(server.state)) {
      throw new ConflictException(
        `Server must be stopped to switch games (current: ${server.state})`,
      );
    }

    if (server.templateId === dto.templateId) {
      throw new BadRequestException('Server already runs that game');
    }

    const target = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
    });
    if (!target) throw new NotFoundException('Target template not found');

    // (2) Whitelist check against the product the subscription pays for.
    const allowed = server.subscription?.product.allowedTemplateIds ?? [];
    this.assertTemplateAllowed(allowed, dto.templateId);

    // Resource sanity: target's recommended memory must fit the plan.
    if (target.recMemoryMb > server.memoryMb) {
      this.logger.warn(
        `Switch to ${target.slug} recommends ${target.recMemoryMb}MB but server has ${server.memoryMb}MB`,
      );
    }

    const dockerImage = this.firstDockerImage(target.dockerImages);
    const gameSwitchLogId = uuidv7();

    // (3)+(4) atomic record + repoint.
    await this.prisma.$transaction([
      this.prisma.gameSwitchLog.create({
        data: {
          id: gameSwitchLogId,
          serverId: server.id,
          fromTemplate: server.template?.slug ?? null,
          toTemplate: target.slug,
          preservedData: dto.preserveData ?? false,
          performedById: actorId,
        },
      }),
      // Clear per-game variable overrides; new game has its own variable set.
      this.prisma.serverVariable.deleteMany({ where: { serverId: server.id } }),
      this.prisma.server.update({
        where: { id: server.id },
        data: {
          templateId: target.id,
          templateVersion: target.version,
          dockerImage,
          startupCommand: target.startupCommand,
          deployMethod: (target.deployMethods[0] as any) ?? server.deployMethod,
          environment: dto.environment ?? {},
          state: 'SWITCHING_GAME',
        },
      }),
    ]);

    // (5) Queue the reinstall (agent wipes/preserves data per flag).
    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId: server.id,
      gameSwitchLogId,
      preserveData: dto.preserveData ?? false,
    } satisfies ReinstallJob);

    return { accepted: true, gameSwitchLogId };
  }

  async gameHistory(id: string) {
    return this.prisma.gameSwitchLog.findMany({
      where: { serverId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- reinstall ---------------------------------------------------------

  async reinstall(id: string, preserveData = true): Promise<{ accepted: true }> {
    const server = await this.get(id);
    if (!STOPPED_STATES.includes(server.state) && server.state !== 'RUNNING') {
      throw new ConflictException(`Cannot reinstall while ${server.state}`);
    }
    await this.prisma.server.update({
      where: { id },
      data: { state: 'REINSTALLING' },
    });
    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId: id,
      preserveData,
    } satisfies ReinstallJob);
    return { accepted: true };
  }

  // ---- resize (upgrade/downgrade) ----------------------------------------

  async resize(id: string, dto: ResizeServerDto): Promise<Server> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    // Validate the node can absorb an upgrade.
    if (dto.memoryMb || dto.cpuCores || dto.diskMb) {
      const cap = await this.nodes.capacity(server.nodeId);
      const deltaMem = (dto.memoryMb ?? server.memoryMb) - server.memoryMb;
      const deltaCpu = (dto.cpuCores ?? server.cpuCores) - server.cpuCores;
      const deltaDisk = (dto.diskMb ?? server.diskMb) - server.diskMb;
      if (
        deltaMem > cap.memory.free ||
        deltaCpu > cap.cpu.free ||
        deltaDisk > cap.disk.free
      ) {
        throw new ConflictException('Node lacks capacity for this upgrade');
      }
    }

    const updated = await this.prisma.server.update({
      where: { id },
      data: {
        cpuCores: dto.cpuCores ?? server.cpuCores,
        memoryMb: dto.memoryMb ?? server.memoryMb,
        swapMb: dto.swapMb ?? server.swapMb,
        diskMb: dto.diskMb ?? server.diskMb,
      },
    });

    // Apply new limits live on the agent (no reinstall needed).
    await this.agent.reconfigure(server.node, {
      serverId: id,
      limits: {
        cpuCores: updated.cpuCores,
        memoryMb: updated.memoryMb,
        swapMb: updated.swapMb,
        diskMb: updated.diskMb,
        ioWeight: updated.ioWeight,
      },
    });
    return updated;
  }

  // ---- console command (one-shot) ----------------------------------------

  async sendCommand(
    id: string,
    command: string,
  ): Promise<{ accepted: true }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.state !== 'RUNNING' && server.state !== 'STARTING') {
      throw new ConflictException(`Server is not running (${server.state})`);
    }
    await this.agent.sendCommand(server.node, server.id, command);
    return { accepted: true };
  }

  // ---- startup command ----------------------------------------------------

  async getStartup(
    id: string,
  ): Promise<{ startupCommand: string | null; dockerImage: string | null }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      select: { startupCommand: true, dockerImage: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return {
      startupCommand: server.startupCommand,
      dockerImage: server.dockerImage,
    };
  }

  async setStartup(
    id: string,
    dto: { startupCommand?: string; dockerImage?: string },
  ): Promise<Server> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return this.prisma.server.update({
      where: { id },
      data: {
        ...(dto.startupCommand !== undefined
          ? { startupCommand: dto.startupCommand }
          : {}),
        ...(dto.dockerImage !== undefined
          ? { dockerImage: dto.dockerImage }
          : {}),
      },
    });
  }

  // ---- upgrade (resize alias + price preview) ----------------------------

  /** Reuses the resize logic; `upgrade` is the web-facing name. */
  async upgrade(
    id: string,
    dto: ResizeServerDto,
  ): Promise<Server> {
    return this.resize(id, dto);
  }

  /**
   * Best-effort price delta for an upgrade. Compares the funding subscription's
   * current price against the cheapest active Product matching the requested
   * resources. Proration specifics are intentionally simplified.
   */
  async upgradePreview(
    id: string,
    dto: { cpuCores?: number; memoryMb?: number; diskMb?: number },
  ): Promise<{
    amountMinor: number;
    currency: string;
    interval: string;
    deltaMinor: number;
  }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscription: { include: { product: { include: { prices: true } } } },
      },
    });
    if (!server) throw new NotFoundException('Server not found');

    const sub = server.subscription;
    const currentPrice = sub?.product.prices.find(
      (p) => p.id === sub.priceId,
    );
    const currency = currentPrice?.currency ?? 'USD';
    const interval = sub?.interval ?? 'MONTHLY';
    const currentAmount = currentPrice?.amountMinor ?? 0;

    // Find the cheapest active product whose resources cover the request, on the
    // same billing interval, to estimate the new recurring amount.
    const wantCpu = dto.cpuCores ?? server.cpuCores;
    const wantMem = dto.memoryMb ?? server.memoryMb;
    const wantDisk = dto.diskMb ?? server.diskMb;

    const candidates = await this.prisma.product.findMany({
      where: {
        isActive: true,
        type: 'GAME_SERVER',
        cpuCores: { gte: wantCpu },
        memoryMb: { gte: wantMem },
        diskMb: { gte: wantDisk },
      },
      include: { prices: { where: { interval, isActive: true } } },
    });

    let newAmount = currentAmount;
    for (const product of candidates) {
      const price = product.prices.find((p) => p.currency === currency);
      if (price && (newAmount === currentAmount || price.amountMinor < newAmount)) {
        newAmount = price.amountMinor;
      }
    }

    // TODO(impl): real proration (remaining-period credit + new-period charge)
    // via the billing gateway; this returns the recurring delta only.
    return {
      amountMinor: newAmount,
      currency,
      interval,
      deltaMinor: newAmount - currentAmount,
    };
  }

  // ---- switchable templates ----------------------------------------------

  /**
   * Templates the server may switch to: those on the funding product's
   * `allowedTemplateIds` whitelist (empty whitelist = all active templates).
   */
  async switchableTemplates(id: string) {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { subscription: { include: { product: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');

    const allowed = server.subscription?.product.allowedTemplateIds ?? [];
    return this.prisma.gameTemplate.findMany({
      where: allowed.length > 0 ? { id: { in: allowed } } : {},
      orderBy: { name: 'asc' },
    });
  }

  // ---- schedule run-now ---------------------------------------------------

  async runSchedule(
    id: string,
    scheduleId: string,
  ): Promise<{ accepted: true }> {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, serverId: id },
      select: { id: true },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');

    // Record the manual trigger; the scheduler worker picks up due schedules.
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { nextRunAt: new Date() },
    });
    // TODO(impl): enqueue an immediate schedule-execution job (run tasks now)
    // once a dedicated schedules queue/worker exists.
    return { accepted: true };
  }

  // ---- suspend / unsuspend / delete --------------------------------------

  async suspend(id: string, reason?: string): Promise<{ accepted: true }> {
    await this.suspensionQueue.add(JOB.SUSPEND, {
      serverId: id,
      action: 'suspend',
      reason,
    });
    await this.prisma.server.update({
      where: { id },
      data: { suspendedAt: new Date(), state: 'SUSPENDED' },
    });
    return { accepted: true };
  }

  async unsuspend(id: string): Promise<{ accepted: true }> {
    await this.suspensionQueue.add(JOB.SUSPEND, {
      serverId: id,
      action: 'unsuspend',
    });
    await this.prisma.server.update({
      where: { id },
      data: { suspendedAt: null, state: 'OFFLINE' },
    });
    return { accepted: true };
  }

  async delete(id: string): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    // Tear down on the node, then soft-delete and free allocations.
    try {
      await this.agent.deleteServer(server.node, server.id);
    } catch (e: any) {
      this.logger.warn(`agent delete failed (continuing soft-delete): ${e.message}`);
    }
    await this.prisma.$transaction([
      this.prisma.allocation.updateMany({
        where: { serverId: id },
        data: { serverId: null, isPrimary: false },
      }),
      this.prisma.server.update({
        where: { id },
        data: { deletedAt: new Date(), state: 'OFFLINE' },
      }),
    ]);
  }

  // ---- helpers -----------------------------------------------------------

  private assertTemplateAllowed(allowed: string[], templateId: string): void {
    // Empty whitelist = all templates permitted.
    if (allowed.length > 0 && !allowed.includes(templateId)) {
      throw new ForbiddenException(
        'This game is not available on your current plan',
      );
    }
  }

  private firstDockerImage(images: Prisma.JsonValue): string | undefined {
    if (images && typeof images === 'object' && !Array.isArray(images)) {
      const values = Object.values(images as Record<string, unknown>);
      if (values.length) return String(values[0]);
    }
    return undefined;
  }
}
