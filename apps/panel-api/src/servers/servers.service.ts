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
  UpgradeServerDto,
} from './dto/server.dto';
import { AdminCreateServerDto } from '../admin/dto/admin.dto';
import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  pickFreePort,
  isPortEnvName,
} from './allocation-port.util';
import { isJavaImage, resolveJavaImage } from '../common/util/java-version.util';
import { MinecraftResolverService } from './minecraft-resolver.service';
import {
  LOADER_STARTUP,
  isMinecraftLoader,
} from './minecraft-loader.util';

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
    private readonly mcResolver: MinecraftResolverService,
    @InjectQueue(QUEUE.PROVISIONING) private readonly provisionQueue: Queue,
    @InjectQueue(QUEUE.REINSTALL) private readonly reinstallQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
  ) {}

  // ---- read --------------------------------------------------------------

  async list(user: AuthUser, pagination: PaginationDto): Promise<Paginated<Server>> {
    // Client area is always scoped to the caller: servers they OWN or are an
    // active sub-user on. Staff do NOT get a platform-wide view here even though
    // they're ADMIN/OWNER — that lives in the admin panel (adminList). This keeps
    // a customer's servers private to them + the sub-users they invite.
    const where: Prisma.ServerWhereInput = {
      deletedAt: null,
      OR: [
        { ownerId: user.id },
        { subUsers: { some: { userId: user.id, state: 'ACTIVE' } } },
      ],
      ...(pagination.q ? { name: { contains: pagination.q, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: {
          template: true,
          node: { select: { name: true, fqdn: true } },
          allocations: true,
        },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(data.map((s) => this.withPrimaryAllocation(s)), total, pagination);
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
    return this.withPrimaryAllocation(server);
  }

  // ---- create / provision ------------------------------------------------

  async create(
    ownerId: string,
    dto: CreateServerDto,
    opts: { deferProvision?: boolean } = {},
  ): Promise<Server> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: dto.subscriptionId, userId: ownerId },
      include: { product: true, hardwareTier: true },
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

    const environment = await this.resolveMinecraftEnv(
      template.slug,
      dto.environment,
    );
    const dockerImage = this.resolveDockerImage(template.dockerImages, environment);

    // Resource limits, by billing model:
    //  • HARDWARE_TIER (game): the chosen tier's fixed RAM/CPU/disk.
    //  • PER_SLOT (voice): per-slot resources × the subscription's slot count.
    //  • legacy flat product: the product's flat resources.
    // All fall back to the template's recommended specs when unset.
    const prod = subscription.product;
    const tier = subscription.hardwareTier;
    const slots = Math.max(1, subscription.slots ?? 1);
    const limits = tier
      ? {
          cpuCores: tier.cpuCores || template.recCpuCores,
          memoryMb: tier.memoryMb || template.recMemoryMb,
          diskMb: tier.diskMb || template.recDiskMb,
        }
      : prod.perSlot
      ? {
          cpuCores: (prod.cpuPerSlot || 0) * slots || template.recCpuCores,
          memoryMb: (prod.memoryMbPerSlot || 0) * slots || template.recMemoryMb,
          diskMb: (prod.diskMbPerSlot || 0) * slots || template.recDiskMb,
        }
      : {
          cpuCores: prod.cpuCores ?? template.recCpuCores,
          memoryMb: prod.memoryMb ?? template.recMemoryMb,
          diskMb: prod.diskMb ?? template.recDiskMb,
        };

    // Voice / per-slot servers: record the purchased slot count in the container
    // environment so the runtime (and TeamSpeak's ServerQuery, where used) can
    // apply the slot cap. SLOTS is generic; TS3SERVER_MAX_CLIENTS is the
    // TeamSpeak-specific knob the egg consumes.
    if (prod.perSlot) {
      const env = environment as Record<string, string>;
      env.SLOTS = String(slots);
      if (template.slug.startsWith('teamspeak')) {
        env.TS3SERVER_MAX_CLIENTS = String(slots);
      }
    }

    // Node placement: a customer-chosen node is validated for eligibility +
    // capacity; otherwise the scheduler picks the best node in the chosen region.
    let nodeId = dto.nodeId;
    if (nodeId) {
      await this.nodes.assertEligibleForOrder(nodeId, limits, dto.regionId);
    } else {
      const node = await this.nodes.pickNodeFor(limits, dto.regionId);
      if (!node) {
        // Surface WHY nothing fit (configured capacity vs. the plan's reserved
        // resources — not host telemetry), so it's actionable.
        const detail = await this.nodes.capacityShortfall(limits, dto.regionId);
        throw new ConflictException(`No node has capacity for this plan. ${detail}`);
      }
      nodeId = node.id;
    }

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
        // Deferred orders are reserved (port + identity) but NOT installed until
        // the first payment clears (see billing.markInvoicePaid → provision).
        state: opts.deferProvision ? 'PENDING_PAYMENT' : 'INSTALLING',
        deployMethod: (template.deployMethods[0] as any) ?? 'DOCKER',
        cpuCores: limits.cpuCores,
        memoryMb: limits.memoryMb,
        diskMb: limits.diskMb,
        // Voice/per-slot servers carry the purchased slot count; game tiers show
        // their informational recommended player count; else the product default.
        slots: prod.perSlot
          ? slots
          : (tier?.recommendedPlayers ?? prod.slots ?? null),
        startupCommand: this.minecraftStartupFor(template, environment),
        dockerImage,
        environment,
        subscriptionId: subscription.id,
        sftpPasswordEnc: this.crypto.encrypt(this.crypto.token(16)),
      },
    });

    // Reserve a reachable public port and wire it into the startup env.
    await this.assignPrimaryAllocation(nodeId, server.id);

    // Only install now when not deferring for payment. Deferred servers are
    // provisioned once the invoice is paid (billing.markInvoicePaid).
    if (!opts.deferProvision) {
      await this.provisionQueue.add(JOB.PROVISION, {
        serverId: server.id,
      } satisfies ProvisionJob);
    }

    return this.prisma.server.findUniqueOrThrow({ where: { id: server.id } });
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

    const environment = await this.resolveMinecraftEnv(
      template.slug,
      dto.environment,
    );
    const dockerImage = this.resolveDockerImage(template.dockerImages, environment);

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
        startupCommand: this.minecraftStartupFor(template, environment),
        dockerImage,
        environment,
        subscriptionId: null,
        sftpPasswordEnc: this.crypto.encrypt(this.crypto.token(16)),
      },
    });

    // Reserve a reachable public port and wire it into the startup env.
    await this.assignPrimaryAllocation(dto.nodeId, server.id);

    await this.provisionQueue.add(JOB.PROVISION, {
      serverId: server.id,
    } satisfies ProvisionJob);

    return this.prisma.server.findUniqueOrThrow({ where: { id: server.id } });
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
          allocations: true,
        },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(data.map((s) => this.withPrimaryAllocation(s)), total, pagination);
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

    const environment = await this.resolveMinecraftEnv(
      target.slug,
      dto.environment,
    );
    const dockerImage = this.resolveDockerImage(target.dockerImages, environment);
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
          startupCommand: this.minecraftStartupFor(target, environment),
          deployMethod: (target.deployMethods[0] as any) ?? server.deployMethod,
          environment,
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

  // ---- change Minecraft version ------------------------------------------

  /**
   * Change the Minecraft version of a Minecraft server: resolve "latest" to a
   * concrete version (per loader), re-pick the JVM image for that version, persist
   * it to the server env (and any matching variable override), then reinstall with
   * data preserved so the world/config survive.
   */
  async changeMinecraftVersion(
    id: string,
    version: string,
  ): Promise<{ accepted: true; version: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const slug = server.template?.slug;
    if (!slug?.startsWith('minecraft-')) {
      throw new BadRequestException('This server is not a Minecraft server');
    }
    if (!STOPPED_STATES.includes(server.state) && server.state !== 'RUNNING') {
      throw new ConflictException(`Cannot change version while ${server.state}`);
    }

    const concrete = await this.mcResolver.resolve(slug, version);
    const environment = {
      ...((server.environment as Record<string, unknown>) ?? {}),
      MINECRAFT_VERSION: concrete,
    } as Prisma.InputJsonObject;
    const dockerImage = this.resolveDockerImage(
      server.template!.dockerImages,
      environment,
    );

    await this.prisma.$transaction([
      this.prisma.server.update({
        where: { id },
        data: { environment, dockerImage, state: 'REINSTALLING' },
      }),
      // Keep an explicit per-server override (if one exists) in sync so it can't
      // shadow the new value in the install spec.
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: 'MINECRAFT_VERSION' },
        data: { value: concrete },
      }),
    ]);

    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId: id,
      preserveData: true,
    } satisfies ReinstallJob);

    return { accepted: true, version: concrete };
  }

  /**
   * Set the loader + version for a unified `minecraft` server: resolve the
   * version, swap the startup command to the loader's launch invocation, re-pick
   * the JVM image, persist LOADER/MINECRAFT_VERSION/LOADER_VERSION, then reinstall
   * with data preserved. This is how the single Minecraft egg becomes vanilla /
   * paper / fabric / forge / neoforge after purchase.
   */
  async setMinecraftConfig(
    id: string,
    dto: { loader: string; version?: string; loaderVersion?: string },
  ): Promise<{ accepted: true; loader: string; version: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (server.template?.slug !== 'minecraft') {
      throw new BadRequestException('This server is not a Minecraft server');
    }
    if (!isMinecraftLoader(dto.loader)) {
      throw new BadRequestException(`Unknown loader: ${dto.loader}`);
    }
    if (!STOPPED_STATES.includes(server.state) && server.state !== 'RUNNING') {
      throw new ConflictException(`Cannot reconfigure while ${server.state}`);
    }

    const { concrete } = await this.applyMinecraftEnv(id, dto, 'REINSTALLING');

    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId: id,
      preserveData: true,
    } satisfies ReinstallJob);

    return { accepted: true, loader: dto.loader, version: concrete };
  }

  /**
   * Write the Minecraft loader/version/loader-version onto a server's environment
   * (+ matching docker image / startup command / variable overrides) WITHOUT
   * queueing a reinstall. Shared by the loader switcher and the modpack installer
   * (which reinstalls itself, in order, after writing files). Returns the
   * resolved concrete MC version.
   */
  async applyMinecraftEnv(
    id: string,
    dto: { loader: string; version?: string; loaderVersion?: string },
    state?: 'REINSTALLING',
  ): Promise<{ concrete: string; loaderVersion: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true },
    });
    if (!server?.template) throw new NotFoundException('Server not found');
    if (!isMinecraftLoader(dto.loader)) {
      throw new BadRequestException(`Unknown loader: ${dto.loader}`);
    }

    const loaderVersion = dto.loaderVersion?.trim() || 'latest';
    const concrete = await this.mcResolver.resolveByLoader(
      dto.loader,
      dto.version ?? 'latest',
    );
    const environment = {
      ...((server.environment as Record<string, unknown>) ?? {}),
      LOADER: dto.loader,
      MINECRAFT_VERSION: concrete,
      LOADER_VERSION: loaderVersion,
    } as Prisma.InputJsonObject;
    const startupCommand = LOADER_STARTUP[dto.loader];
    const dockerImage = this.resolveDockerImage(
      server.template.dockerImages,
      environment,
    );

    await this.prisma.$transaction([
      this.prisma.server.update({
        where: { id },
        data: {
          environment,
          startupCommand,
          dockerImage,
          ...(state ? { state } : {}),
        },
      }),
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: 'LOADER' },
        data: { value: dto.loader },
      }),
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: 'MINECRAFT_VERSION' },
        data: { value: concrete },
      }),
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: 'LOADER_VERSION' },
        data: { value: loaderVersion },
      }),
    ]);

    return { concrete, loaderVersion };
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
  async upgrade(id: string, dto: UpgradeServerDto): Promise<Server> {
    // Tiered game products upgrade by HARDWARE TIER; per-slot products upgrade by
    // SLOT COUNT (resources + price scale together); a legacy flat product
    // resizes raw resources.
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true, subscription: { include: { product: true } } },
    });
    if (!server) throw new NotFoundException('Server not found');
    const sub = server.subscription;
    const product = sub?.product;

    // ---- Hardware-tier change (move to a higher/lower tier) ----------------
    if (dto.hardwareTierId) {
      if (!sub || !product) {
        throw new BadRequestException('Server has no subscription to change');
      }
      const tier = await this.prisma.hardwareTier.findFirst({
        where: { id: dto.hardwareTierId, productId: product.id },
        include: { prices: true },
      });
      if (!tier) throw new BadRequestException('Tier does not belong to this product');
      if (!tier.isActive) throw new BadRequestException('That tier is not available');

      const currentPrice = await this.prisma.price.findUnique({
        where: { id: sub.priceId },
        select: { currency: true },
      });
      const currency = currentPrice?.currency ?? 'USD';
      const newPrice = tier.prices.find(
        (p) => p.interval === sub.interval && p.currency === currency && p.isActive,
      );
      if (!newPrice) {
        throw new BadRequestException(
          `That tier has no ${sub.interval.toLowerCase()} (${currency}) price`,
        );
      }

      const limits = {
        cpuCores: tier.cpuCores,
        memoryMb: tier.memoryMb,
        diskMb: tier.diskMb,
      };
      // The node must absorb the delta when growing.
      const cap = await this.nodes.capacity(server.nodeId);
      if (
        limits.memoryMb - server.memoryMb > cap.memory.free ||
        limits.cpuCores - server.cpuCores > cap.cpu.free ||
        limits.diskMb - server.diskMb > cap.disk.free
      ) {
        throw new ConflictException('Node lacks capacity for this upgrade');
      }

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { hardwareTierId: tier.id, priceId: newPrice.id },
      });
      const updated = await this.prisma.server.update({
        where: { id },
        data: { ...limits, slots: tier.recommendedPlayers ?? server.slots },
      });
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

    if (product?.perSlot && dto.slots != null) {
      const slots = Math.min(
        Math.max(dto.slots, product.minSlots || 1),
        product.maxSlots || dto.slots,
      );
      const limits = {
        cpuCores: +((product.cpuPerSlot || 0) * slots).toFixed(2),
        memoryMb: (product.memoryMbPerSlot || 0) * slots,
        diskMb: (product.diskMbPerSlot || 0) * slots,
      };
      // Node must absorb the delta (only when growing).
      const cap = await this.nodes.capacity(server.nodeId);
      if (
        limits.memoryMb - server.memoryMb > cap.memory.free ||
        limits.cpuCores - server.cpuCores > cap.cpu.free ||
        limits.diskMb - server.diskMb > cap.disk.free
      ) {
        throw new ConflictException('Node lacks capacity for this upgrade');
      }
      await this.prisma.subscription.update({
        where: { id: server.subscriptionId! },
        data: { slots },
      });
      const updated = await this.prisma.server.update({
        where: { id },
        data: { slots, ...limits },
      });
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

    return this.resize(id, dto);
  }

  /** Upgrade context for the upgrade page: hardware tiers (tiered products) or
   *  per-slot scaling (voice/legacy), plus the server's current resources. */
  async upgradeOptions(id: string): Promise<{
    perSlot: boolean;
    currency: string;
    interval: string;
    slots: number;
    minSlots: number;
    maxSlots: number;
    slotStep: number;
    cpuPerSlot: number;
    memoryMbPerSlot: number;
    diskMbPerSlot: number;
    perSlotAmountMinor: number;
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
    currentTierId: string | null;
    tiers: Array<{
      id: string;
      name: string;
      description: string | null;
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
      recommendedPlayers: number | null;
      isRecommended: boolean;
      amountMinor: number | null;
    }>;
  }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscription: {
          include: {
            product: {
              include: {
                prices: true,
                hardwareTiers: {
                  where: { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                  include: { prices: true },
                },
              },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException('Server not found');
    const sub = server.subscription;
    const product = sub?.product;
    const price = product?.prices.find((p) => p.id === sub?.priceId);
    const currency = price?.currency ?? 'USD';
    const interval = sub?.interval ?? 'MONTHLY';

    // For tiered products, each tier's price for the subscription's interval +
    // currency (so the page can show the new recurring cost per tier).
    const tiers = (product?.hardwareTiers ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      cpuCores: t.cpuCores,
      memoryMb: t.memoryMb,
      diskMb: t.diskMb,
      recommendedPlayers: t.recommendedPlayers,
      isRecommended: t.isRecommended,
      amountMinor:
        t.prices.find(
          (p) => p.interval === interval && p.currency === currency && p.isActive,
        )?.amountMinor ?? null,
    }));

    return {
      perSlot: !!product?.perSlot,
      currency,
      interval,
      slots: sub?.slots ?? server.slots ?? 1,
      minSlots: product?.minSlots ?? 1,
      maxSlots: product?.maxSlots ?? 64,
      slotStep: product?.slotStep || 1,
      cpuPerSlot: product?.cpuPerSlot ?? 0,
      memoryMbPerSlot: product?.memoryMbPerSlot ?? 0,
      diskMbPerSlot: product?.diskMbPerSlot ?? 0,
      perSlotAmountMinor: price?.amountMinor ?? 0,
      cpuCores: server.cpuCores,
      memoryMb: server.memoryMb,
      diskMb: server.diskMb,
      currentTierId: sub?.hardwareTierId ?? null,
      tiers,
    };
  }

  /**
   * Price preview for an upgrade. Per-slot products price as
   * `perSlotAmount × slots`; legacy flat products fall back to the cheapest
   * covering product. Proration specifics are intentionally simplified.
   */
  async upgradePreview(
    id: string,
    dto: {
      hardwareTierId?: string;
      slots?: number;
      cpuCores?: number;
      memoryMb?: number;
      diskMb?: number;
    },
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
    const currentPrice = sub?.product.prices.find((p) => p.id === sub.priceId);
    const currency = currentPrice?.currency ?? 'USD';
    const interval = sub?.interval ?? 'MONTHLY';
    const currentAmountMinor = currentPrice?.amountMinor ?? 0;

    // Tier change: recurring = the target tier's price for this interval/currency.
    if (dto.hardwareTierId && sub) {
      const tierPrice = await this.prisma.price.findFirst({
        where: {
          hardwareTierId: dto.hardwareTierId,
          interval: sub.interval,
          currency,
          isActive: true,
        },
        select: { amountMinor: true },
      });
      const newAmount = tierPrice?.amountMinor ?? currentAmountMinor;
      return {
        amountMinor: newAmount,
        currency,
        interval,
        deltaMinor: newAmount - currentAmountMinor,
      };
    }

    // Per-slot: recurring = per-slot rate × slots.
    if (sub?.product.perSlot && dto.slots != null) {
      const perSlot = currentPrice?.amountMinor ?? 0;
      const currentSlots = sub.slots ?? 1;
      const slots = Math.min(
        Math.max(dto.slots, sub.product.minSlots || 1),
        sub.product.maxSlots || dto.slots,
      );
      const newAmount = perSlot * slots;
      return {
        amountMinor: newAmount,
        currency,
        interval,
        deltaMinor: newAmount - perSlot * currentSlots,
      };
    }

    // Legacy flat products: cheapest active product covering the requested specs.
    const currentAmount = currentPrice?.amountMinor ?? 0;
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

  /**
   * Reserve a reachable public port for a freshly created server and wire it into
   * the startup environment so `{{SERVER_PORT}}` (and any port-like template
   * variable) resolves at install time:
   *   1. Pick the lowest free port in [25565, 25999] on the node.
   *   2. Create the primary Allocation { ip: node.fqdn, port, isPrimary }.
   *   3. Merge SERVER_PORT / SERVER_PORT_PRIMARY into the server's environment and
   *      set a ServerVariable override for any template variable whose envName
   *      looks like a port.
   * Concurrency-safe enough: on a unique-constraint clash it retries the next
   * free port a few times.
   *
   * TODO(impl): multi-IP nodes (currently binds the single node.fqdn).
   * TODO(impl): resolve a hostname fqdn to a concrete bind IP (works today
   *   because our node fqdn is an IP).
   */
  private async assignPrimaryAllocation(
    nodeId: string,
    serverId: string,
  ): Promise<number> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { fqdn: true, allocationPortStart: true, allocationPortEnd: true },
    });
    if (!node) throw new NotFoundException('Node not found');

    // Per-node configurable range (falls back to the global default).
    const rangeStart = node.allocationPortStart || PORT_RANGE_START;
    const rangeEnd = node.allocationPortEnd || PORT_RANGE_END;

    const MAX_ATTEMPTS = 5;
    let port = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Re-query taken ports each attempt so a concurrent allocation is observed.
      const taken = await this.prisma.allocation.findMany({
        where: { nodeId, port: { gte: rangeStart, lte: rangeEnd } },
        select: { port: true },
      });
      const candidate = pickFreePort(
        taken.map((a) => a.port),
        rangeStart,
        rangeEnd,
      );

      try {
        await this.prisma.allocation.create({
          data: {
            id: uuidv7(),
            nodeId,
            ip: node.fqdn,
            port: candidate,
            serverId,
            isPrimary: true,
          },
        });
        port = candidate;
        break;
      } catch (e) {
        // Unique-constraint clash on (nodeId, ip, port): another server grabbed
        // it first. Retry with a freshly computed free port.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002' &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        throw e;
      }
    }

    if (!port) {
      throw new ConflictException('No free port available on the node');
    }

    // Wire the primary port into the startup env so {{SERVER_PORT}} resolves.
    const server = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      select: { environment: true, templateId: true },
    });
    const environment: Record<string, unknown> = {
      ...((server.environment as Record<string, unknown>) ?? {}),
      SERVER_PORT: String(port),
      SERVER_PORT_PRIMARY: String(port),
    };

    // Each port-like template variable (RCON_PORT, QUERY_PORT, UDP_PORT,
    // BEACON_PORT, …) needs its OWN distinct port: games like ARK, Satisfactory,
    // Palworld and Project Zomboid bind game + query + RCON simultaneously and
    // fail if those collide. Reserve a separate free port (and a non-primary
    // Allocation, so the agent forwards it) for each, and override its variable.
    const portVars = server.templateId
      ? await this.prisma.templateVariable.findMany({
          where: { templateId: server.templateId },
          select: { envName: true },
        })
      : [];
    const taken = new Set<number>(
      (
        await this.prisma.allocation.findMany({
          where: { nodeId, port: { gte: rangeStart, lte: rangeEnd } },
          select: { port: true },
        })
      ).map((a) => a.port),
    );
    for (const v of portVars) {
      if (!isPortEnvName(v.envName)) continue;
      let assigned = 0;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const candidate = pickFreePort(taken, rangeStart, rangeEnd);
        if (taken.has(candidate)) break; // pool exhausted → fall back to primary
        try {
          await this.prisma.allocation.create({
            data: {
              id: uuidv7(),
              nodeId,
              ip: node.fqdn,
              port: candidate,
              serverId,
              isPrimary: false,
            },
          });
          taken.add(candidate);
          assigned = candidate;
          break;
        } catch (e) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            taken.add(candidate); // someone grabbed it; mark taken and retry
            continue;
          }
          throw e;
        }
      }
      if (!assigned) assigned = port; // no free port left: reuse the primary
      environment[v.envName] = String(assigned);
      await this.prisma.serverVariable.upsert({
        where: { serverId_envName: { serverId, envName: v.envName } },
        create: {
          id: uuidv7(),
          serverId,
          envName: v.envName,
          value: String(assigned),
        },
        update: { value: String(assigned) },
      });
    }

    await this.prisma.server.update({
      where: { id: serverId },
      data: { environment: environment as Prisma.InputJsonValue },
    });

    return port;
  }

  /**
   * Surface the server's connection address by flattening its allocations into a
   * single `primaryAllocation` (the one flagged primary, else the first). The web
   * panel renders {ip}:{port} from this; without it the address never shows.
   */
  private withPrimaryAllocation<
    T extends { allocations?: { isPrimary: boolean }[] | null },
  >(server: T) {
    const allocations = server.allocations ?? [];
    const primary = allocations.find((a) => a.isPrimary) ?? allocations[0] ?? null;
    return { ...server, primaryAllocation: primary };
  }

  private assertTemplateAllowed(allowed: string[], templateId: string): void {
    // Empty whitelist = all templates permitted.
    if (allowed.length > 0 && !allowed.includes(templateId)) {
      throw new ForbiddenException(
        'This game is not available on your current plan',
      );
    }
  }

  /**
   * Pick the runtime image for a server, auto-selecting the right JVM for
   * Minecraft templates. For a Java image the eclipse-temurin tag is chosen from
   * the requested MINECRAFT_VERSION (falling back to "latest" → newest Java when
   * the customer didn't pin one); non-Java templates keep their configured image.
   * The agent also runs the install script in this image, so install + runtime
   * stay on one compatible JVM.
   */
  /**
   * For minecraft-* templates, resolve a "latest" MINECRAFT_VERSION to a concrete
   * version (per loader) so the JVM image and the install target agree. Other
   * templates pass their environment through unchanged.
   */
  private async resolveMinecraftEnv(
    templateSlug: string | null | undefined,
    environment?: Record<string, unknown> | null,
  ): Promise<Prisma.InputJsonObject> {
    const env = { ...((environment ?? {}) as Record<string, string>) };
    const requested =
      env['MINECRAFT_VERSION'] != null
        ? String(env['MINECRAFT_VERSION'])
        : 'latest';
    if (templateSlug === 'minecraft') {
      // Unified egg: loader is per-server (LOADER env), not in the slug.
      env['MINECRAFT_VERSION'] = await this.mcResolver.resolveByLoader(
        String(env['LOADER'] ?? 'paper'),
        requested,
      );
    } else if (templateSlug?.startsWith('minecraft-')) {
      env['MINECRAFT_VERSION'] = await this.mcResolver.resolve(
        templateSlug,
        requested,
      );
    }
    return env as Prisma.InputJsonObject;
  }

  /**
   * Startup command for a new server. For the unified `minecraft` egg this picks
   * the per-loader invocation (Fabric → fabric-server-launch.jar, Forge/NeoForge
   * → @arg files) so an ordered non-Paper server boots instead of failing with
   * "Unable to access jarfile server.jar". Other templates use their own command.
   */
  private minecraftStartupFor(
    template: { slug: string | null; startupCommand: string },
    environment: Record<string, unknown> | null | undefined,
  ): string {
    if (template.slug !== 'minecraft') return template.startupCommand;
    const loader = String((environment ?? {})['LOADER'] ?? 'paper');
    return isMinecraftLoader(loader) ? LOADER_STARTUP[loader] : template.startupCommand;
  }

  private resolveDockerImage(
    images: Prisma.JsonValue,
    environment?: Record<string, unknown> | null,
  ): string | undefined {
    const base = this.firstDockerImage(images);
    if (!isJavaImage(base)) return base;
    const env = (environment ?? {}) as Record<string, unknown>;
    const mc =
      env['MINECRAFT_VERSION'] != null
        ? String(env['MINECRAFT_VERSION'])
        : 'latest';
    return resolveJavaImage(base, mc, 'jre');
  }

  private firstDockerImage(images: Prisma.JsonValue): string | undefined {
    if (images && typeof images === 'object' && !Array.isArray(images)) {
      const values = Object.values(images as Record<string, unknown>);
      if (values.length) return String(values[0]);
    }
    return undefined;
  }
}
