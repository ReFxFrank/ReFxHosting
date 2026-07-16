import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  PendingPlanChange,
  Prisma,
  Server,
  ServerState,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { uuidv7, shortId } from "../common/util/uuid";
import {
  Paginated,
  PaginationDto,
  paginate,
} from "../common/dto/pagination.dto";
import { AuthUser } from "../common/decorators/current-user.decorator";
import { hasPermission } from "../common/permissions";
import {
  ALL_SERVER_PERMISSIONS,
  expandServerPermissions,
} from "../common/server-permissions";
import { NodesService } from "../nodes/nodes.service";
import { NodeAgentClient, PowerSignal } from "../agent/agent.client";
import {
  JOB,
  ProvisionJob,
  QUEUE,
  ReinstallJob,
  INSTALL_JOB_OPTS,
} from "../queues/queue.constants";
import {
  CreateServerDto,
  ResizeServerDto,
  SwitchGameDto,
  UpgradeServerDto,
} from "./dto/server.dto";
import { AdminCreateServerDto } from "../admin/dto/admin.dto";
import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  pickFreePort,
  isPortEnvName,
  buildAllocationAlias,
  withPrimaryAllocation,
} from "./allocation-port.util";
import {
  isJavaImage,
  resolveJavaImage,
} from "../common/util/java-version.util";
import { MinecraftResolverService } from "./minecraft-resolver.service";
import { BillingService } from "../billing/billing.service";
import { LOADER_STARTUP, isMinecraftLoader } from "./minecraft-loader.util";
import {
  NODE_PUBLIC_SELECT,
  PLAN_CHANGE_SUBSCRIPTION_SELECT,
  PlanChangeSubscription,
  PublicNode,
  PublicServer,
  SERVER_SECRET_OMIT,
} from "./server-secrets.util";

/**
 * Outcome of a plan change. An UPGRADE is `invoiced` (server stays on the old
 * configuration until the returned invoice is paid); a cheaper plan is
 * `scheduled` to apply at the next renewal; a no-cost change is `applied` now.
 */
export type PlanChangeResult =
  | { status: "applied"; server: PublicServer }
  | {
      status: "invoiced";
      server: PublicServer;
      invoiceId: string;
      amountMinor: number;
      currency: string;
    }
  | { status: "scheduled"; server: PublicServer; effectiveAt: Date };

/** Target plan configuration staged by a plan change. */
interface PlanChangeTarget {
  priceId: string;
  hardwareTierId: string | null;
  slots: number;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
}

// Plan-change working shape: a secret-stripped row with the PUBLIC node
// projection — it ends up embedded verbatim in the PlanChangeResult the route
// returns. Agent calls on this path re-fetch the full node row themselves.
type ServerWithNode = PublicServer & { node: PublicNode };

/** Power signals that require the server to first be RUNNING/STARTING. */
const STOPPED_STATES: ServerState[] = ["OFFLINE", "CRASHED"];

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly nodes: NodesService,
    private readonly agent: NodeAgentClient,
    private readonly mcResolver: MinecraftResolverService,
    private readonly billing: BillingService,
    @InjectQueue(QUEUE.PROVISIONING) private readonly provisionQueue: Queue,
    @InjectQueue(QUEUE.REINSTALL) private readonly reinstallQueue: Queue,
    @InjectQueue(QUEUE.SUSPENSION) private readonly suspensionQueue: Queue,
  ) {}

  // ---- read --------------------------------------------------------------

  async list(
    user: AuthUser,
    pagination: PaginationDto,
  ): Promise<Paginated<PublicServer>> {
    // Client area is always scoped to the caller: servers they OWN or are an
    // active sub-user on. Staff do NOT get a platform-wide view here even though
    // they're ADMIN/OWNER — that lives in the admin panel (adminList). This keeps
    // a customer's servers private to them + the sub-users they invite.
    const where: Prisma.ServerWhereInput = {
      deletedAt: null,
      OR: [
        { ownerId: user.id },
        { subUsers: { some: { userId: user.id, state: "ACTIVE" } } },
      ],
      ...(pagination.q
        ? { name: { contains: pagination.q, mode: "insensitive" } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: "desc" },
        omit: SERVER_SECRET_OMIT,
        include: {
          template: true,
          node: { select: NODE_PUBLIC_SELECT },
          allocations: true,
        },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(
      data.map((s) => withPrimaryAllocation(s)),
      total,
      pagination,
    );
  }

  async get(id: string): Promise<PublicServer> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      omit: SERVER_SECRET_OMIT,
      include: {
        template: true,
        // Display projection only — the full node row carries control-plane
        // material (token hash, pinned agent cert, daemon address) that must
        // not ride on a customer response.
        node: { select: NODE_PUBLIC_SELECT },
        allocations: true,
        variables: true,
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    return withPrimaryAllocation(server);
  }

  /**
   * Server detail plus the caller's effective per-server permissions
   * (`viewerPermissions`). The web uses this to gate the tabs and per-action
   * buttons a sub-user sees, so they get exactly the access the owner granted —
   * no 403 walls, no hidden-but-clickable actions. Owners and staff with the
   * admin `servers.manage` capability receive the full catalog.
   */
  async getWithViewer(
    user: AuthUser,
    id: string,
  ): Promise<PublicServer & { viewerPermissions: string[] }> {
    const server = await this.get(id);
    const viewerPermissions = await this.viewerPermissions(user, server);
    return { ...server, viewerPermissions };
  }

  /** Concrete (wildcard-expanded) list of per-server permissions `user` holds
   * on `server`: everything for the owner or `servers.manage` staff, otherwise
   * the sub-user's granted set plus the implicit baseline. */
  private async viewerPermissions(
    user: AuthUser,
    server: Pick<Server, "id" | "ownerId">,
  ): Promise<string[]> {
    if (
      hasPermission(user.permissions ?? [], "servers.manage") ||
      server.ownerId === user.id
    ) {
      return [...ALL_SERVER_PERMISSIONS];
    }
    const sub = await this.prisma.subUser.findFirst({
      where: { serverId: server.id, userId: user.id, state: "ACTIVE" },
      select: { permissions: true },
    });
    return expandServerPermissions(sub?.permissions ?? []);
  }

  /**
   * Ownership-scoped get for surfaces that DON'T sit behind PermissionGuard
   * (e.g. the GraphQL resolver). Restricts to servers the caller owns or is an
   * active sub-user on — same scoping as list() — so it can't be used as an IDOR
   * to read another tenant's server. Staff use the admin surface, not this.
   */
  async getForUser(user: AuthUser, id: string): Promise<PublicServer> {
    const server = await this.prisma.server.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { ownerId: user.id },
          { subUsers: { some: { userId: user.id, state: "ACTIVE" } } },
        ],
      },
      omit: SERVER_SECRET_OMIT,
      include: {
        template: true,
        // Same public projection as get() — never the full node row.
        node: { select: NODE_PUBLIC_SELECT },
        allocations: true,
        variables: true,
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    return withPrimaryAllocation(server);
  }

  /** Game-switch history, gated on the caller's access to the server first. */
  async gameHistoryForUser(user: AuthUser, id: string) {
    await this.getForUser(user, id); // throws NotFound if the caller can't see it
    return this.gameHistory(id);
  }

  // ---- create / provision ------------------------------------------------

  async create(
    ownerId: string,
    dto: CreateServerDto,
    opts: { deferProvision?: boolean } = {},
  ): Promise<PublicServer> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: dto.subscriptionId, userId: ownerId },
      include: { product: true, hardwareTier: true },
    });
    if (!subscription) throw new NotFoundException("Subscription not found");
    if (subscription.state !== "ACTIVE" && subscription.state !== "TRIALING") {
      throw new BadRequestException("Subscription is not active");
    }

    // SECURITY (SEC-01): never install on an unpaid subscription. The order flow
    // reserves unpaid servers with `deferProvision: true` and installs them from
    // billing.markInvoicePaid once payment clears; any *immediate* provisioning
    // must be backed by a settled invoice. Without this, POST /billing/subscriptions
    // (which mints an ACTIVE subscription with no charge) chained with POST /servers
    // would provision free compute. Deferred (reserved-but-not-installed) servers
    // are exempt — they carry no running workload until paid.
    if (!opts.deferProvision) {
      const paid = await this.prisma.invoice.findFirst({
        where: { subscriptionId: subscription.id, state: "PAID" },
        select: { id: true },
      });
      if (!paid) {
        throw new BadRequestException(
          "Subscription has no settled payment — provisioning is not allowed.",
        );
      }
    }

    // SECURITY (SEC-01b): one server per subscription. A subscription is billed
    // for exactly one server (game-switch/resize keep the same server), so a
    // single paid subscription must not be able to back multiple servers.
    const existingServer = await this.prisma.server.findFirst({
      where: { subscriptionId: subscription.id, deletedAt: null },
      select: { id: true },
    });
    if (existingServer) {
      throw new BadRequestException("Subscription already has a server.");
    }

    const template = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
      include: { category: { select: { slug: true } } },
    });
    if (!template) throw new NotFoundException("Template not found");
    this.assertTemplateAllowed(
      subscription.product.allowedTemplateIds,
      dto.templateId,
    );

    const environment = await this.resolveMinecraftEnv(
      template.slug,
      dto.environment,
    );
    const dockerImage = this.resolveDockerImage(
      template.dockerImages,
      environment,
    );

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
            memoryMb:
              (prod.memoryMbPerSlot || 0) * slots || template.recMemoryMb,
            diskMb: (prod.diskMbPerSlot || 0) * slots || template.recDiskMb,
          }
        : {
            cpuCores: prod.cpuCores ?? template.recCpuCores,
            memoryMb: prod.memoryMb ?? template.recMemoryMb,
            diskMb: prod.diskMb ?? template.recDiskMb,
          };

    // Voice servers need a slot cap regardless of billing model: a per-slot
    // product uses the purchased count; a flat-tier voice product (TeamSpeak's
    // new model) carries it as the tier's recommendedPlayers. Record it in the
    // container env so the runtime (and TeamSpeak's ServerQuery) can apply it.
    // SLOTS is generic; TS3SERVER_MAX_CLIENTS is the TeamSpeak-specific knob.
    const voiceSlots = prod.perSlot
      ? slots
      : (tier?.recommendedPlayers ?? prod.slots ?? null);
    if (voiceSlots && (prod.perSlot || template.slug.startsWith("teamspeak"))) {
      const env = environment as Record<string, string>;
      env.SLOTS = String(voiceSlots);
      if (template.slug.startsWith("teamspeak")) {
        env.TS3SERVER_MAX_CLIENTS = String(voiceSlots);
      }
    }

    // Node placement: a customer-chosen node is validated for eligibility +
    // capacity; otherwise the scheduler picks the best node in the chosen region.
    // WEB_APP servers need a web-enabled node (Caddy on :80/:443) — the scheduler
    // and the eligibility check filter to supportsWeb nodes when this is set.
    const requiresWeb = this.serverTypeForTemplate(template) === "WEB_APP";
    let nodeId = dto.nodeId;
    if (nodeId) {
      await this.nodes.assertEligibleForOrder(
        nodeId,
        limits,
        dto.regionId,
        requiresWeb,
      );
    } else {
      const node = await this.nodes.pickNodeFor(
        limits,
        dto.regionId,
        requiresWeb,
      );
      if (!node) {
        // Surface WHY nothing fit (configured capacity vs. the plan's reserved
        // resources — not host telemetry), so it's actionable.
        const detail = await this.nodes.capacityShortfall(
          limits,
          dto.regionId,
          requiresWeb,
        );
        throw new ConflictException(
          `No node has capacity for this plan. ${detail}`,
        );
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
        state: opts.deferProvision ? "PENDING_PAYMENT" : "INSTALLING",
        deployMethod: (template.deployMethods[0] as any) ?? "DOCKER",
        // Voice servers are a separate product line; record the type now and
        // treat it as immutable (a voice server is never game-switched). Classify
        // by the TEMPLATE — identical to adminCreate() and the migration backfill —
        // so an order and an admin-create of the same template always agree,
        // independent of how the product's per-slot pricing happens to be set.
        serverType: this.serverTypeForTemplate(template),
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
        // Offsite-backup entitlement rides on the subscription (it's billed
        // there every cycle); mirror it onto the server for backup routing.
        expressBackups: subscription.expressBackups,
        sftpPasswordEnc: this.crypto.encrypt(this.crypto.token(16)),
      },
    });

    // Reserve a reachable public port and wire it into the startup env.
    await this.assignPrimaryAllocation(nodeId, server.id);

    // Only install now when not deferring for payment. Deferred servers are
    // provisioned once the invoice is paid (billing.markInvoicePaid).
    if (!opts.deferProvision) {
      await this.provisionQueue.add(
        JOB.PROVISION,
        { serverId: server.id } satisfies ProvisionJob,
        INSTALL_JOB_OPTS,
      );
    }

    return this.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
      omit: SERVER_SECRET_OMIT,
    });
  }

  /**
   * Admin-driven server creation (Pterodactyl-style): provisions a server from
   * an egg directly for any owner, WITHOUT a billing subscription. Validates the
   * owner/node/template, writes the Server row (subscriptionId = null), and
   * enqueues provisioning identically to the customer `create()` path so the node
   * agent installs it.
   */
  async adminCreate(dto: AdminCreateServerDto): Promise<PublicServer> {
    const owner = await this.prisma.user.findFirst({
      where: { id: dto.ownerId, deletedAt: null },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException("Owner not found");

    const node = await this.prisma.node.findFirst({
      where: { id: dto.nodeId, deletedAt: null },
      select: { id: true, supportsWeb: true },
    });
    if (!node) throw new NotFoundException("Node not found");

    const template = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
      include: { category: { select: { slug: true } } },
    });
    if (!template) throw new NotFoundException("Template not found");

    // A web app needs a web-enabled node (Caddy on :80/:443); refuse to place one
    // on a node that can't serve it, so staff get a clear error not a broken site.
    if (
      this.serverTypeForTemplate(template) === "WEB_APP" &&
      !node.supportsWeb
    ) {
      throw new BadRequestException(
        "This node is not web-enabled — pick a node with web hosting support.",
      );
    }

    const environment = await this.resolveMinecraftEnv(
      template.slug,
      dto.environment,
    );
    const dockerImage = this.resolveDockerImage(
      template.dockerImages,
      environment,
    );

    // Voice / slot-based templates (e.g. TeamSpeak) are sized from the egg's
    // recommended specs and provisioned by slot count rather than raw specs.
    const isVoice =
      template.category?.slug === "voice" ||
      template.slug.startsWith("teamspeak");
    const slots = dto.slots && dto.slots > 0 ? Math.floor(dto.slots) : null;

    // Voice servers are SLOT-BASED: staff pick a slot count, never RAM/CPU. Size
    // them from the egg's recommended specs and require a slot count — any raw
    // cpu/mem/disk in the request is ignored so voice can't carry a hardware
    // designation. Game servers use the supplied (or recommended) specs as before.
    if (isVoice && !slots) {
      throw new BadRequestException("Voice servers require a slot count.");
    }
    const cpuCores = isVoice
      ? template.recCpuCores
      : (dto.cpuCores ?? template.recCpuCores);
    const memoryMb = isVoice
      ? template.recMemoryMb
      : (dto.memoryMb ?? template.recMemoryMb);
    const diskMb = isVoice
      ? template.recDiskMb
      : (dto.diskMb ?? template.recDiskMb);

    // Inject the slot cap into the container environment so the runtime (and
    // TeamSpeak's ServerQuery, via the egg launcher) can enforce it. SLOTS is
    // generic; TS3SERVER_MAX_CLIENTS is the TeamSpeak-specific knob.
    if (isVoice && slots) {
      const env = environment as Record<string, string>;
      env.SLOTS = String(slots);
      if (template.slug.startsWith("teamspeak")) {
        env.TS3SERVER_MAX_CLIENTS = String(slots);
      }
    }

    const server = await this.prisma.server.create({
      data: {
        id: uuidv7(),
        shortId: shortId(),
        name: dto.name,
        ownerId: dto.ownerId,
        nodeId: dto.nodeId,
        templateId: template.id,
        templateVersion: template.version,
        state: "INSTALLING",
        deployMethod: (template.deployMethods[0] as any) ?? "DOCKER",
        // Authoritative web/voice/game discriminator, set once at creation.
        serverType: this.serverTypeForTemplate(template),
        cpuCores,
        memoryMb,
        diskMb,
        slots: isVoice ? slots : null,
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

    return this.prisma.server.findUniqueOrThrow({
      where: { id: server.id },
      omit: SERVER_SECRET_OMIT,
    });
  }

  /** Admin list of every (non-deleted) server with node/owner/template names. */
  async adminList(pagination: PaginationDto): Promise<Paginated<PublicServer>> {
    const where: Prisma.ServerWhereInput = {
      deletedAt: null,
      ...(pagination.q
        ? { name: { contains: pagination.q, mode: "insensitive" } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: "desc" },
        omit: SERVER_SECRET_OMIT,
        include: {
          template: { select: { id: true, name: true, slug: true } },
          node: { select: { id: true, name: true, fqdn: true } },
          owner: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          allocations: true,
          // Express Backups state so the admin UI can show paid vs comped vs off
          // (Server.expressBackups is the routing flag, already a scalar here).
          subscription: {
            select: { expressBackups: true, expressBackupsComp: true },
          },
        },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(
      data.map((s) => withPrimaryAllocation(s)),
      total,
      pagination,
    );
  }

  // ---- power -------------------------------------------------------------

  async power(id: string, signal: PowerSignal): Promise<{ accepted: true }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true, template: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (server.state === "SUSPENDED") {
      throw new ForbiddenException("Server is suspended");
    }
    if (server.state === "INSTALLING" || server.state === "REINSTALLING") {
      throw new ConflictException(`Cannot ${signal} while ${server.state}`);
    }

    // TeamSpeak: the customer must accept TeamSpeak's license before the voice
    // server may run. Enforced here so we never start a server that would block.
    if (
      (signal === "start" || signal === "restart") &&
      (server.template?.slug ?? "").startsWith("teamspeak") &&
      String(
        (server.environment as Record<string, unknown> | null)?.[
          "REFX_TS3_LICENSE_ACCEPTED"
        ] ?? "",
      ) !== "1"
    ) {
      throw new BadRequestException(
        "Accept the TeamSpeak license on the Voice tab before starting this server.",
      );
    }

    await this.agent.power(server.node, server.id, signal);

    // Optimistic transition; the agent confirms the real state via heartbeat.
    const nextState: ServerState =
      signal === "start"
        ? "STARTING"
        : signal === "restart"
          ? "STARTING"
          : "STOPPING";
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
      include: {
        template: { include: { category: { select: { slug: true } } } },
        subscription: { include: { product: true } },
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    // Voice servers can't be switched to a game — they keep their identity for
    // life. Authoritative check on the stored discriminator, not the template.
    if (server.serverType === "VOICE_SERVER") {
      throw new BadRequestException(
        "Voice servers cannot be switched to a game.",
      );
    }

    // (1) Must be stopped.
    if (!STOPPED_STATES.includes(server.state)) {
      throw new ConflictException(
        `Server must be stopped to switch games (current: ${server.state})`,
      );
    }

    if (server.templateId === dto.templateId) {
      throw new BadRequestException("Server already runs that game");
    }

    const target = await this.prisma.gameTemplate.findUnique({
      where: { id: dto.templateId },
      include: { category: { select: { slug: true } } },
    });
    if (!target) throw new NotFoundException("Target template not found");

    // Voice and game servers are separate worlds: a game server can't be
    // switched *into* a voice template (the reverse is rejected above). The
    // target has no Server row yet, so classify it by template.
    if (this.isVoiceTemplate(target)) {
      throw new BadRequestException(
        "Game servers cannot be switched into a voice server.",
      );
    }

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
    const dockerImage = this.resolveDockerImage(
      target.dockerImages,
      environment,
    );
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
          state: "SWITCHING_GAME",
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
      orderBy: { createdAt: "desc" },
    });
  }

  // ---- reinstall ---------------------------------------------------------

  async reinstall(
    id: string,
    preserveData = true,
  ): Promise<{ accepted: true }> {
    const server = await this.get(id);
    if (!STOPPED_STATES.includes(server.state) && server.state !== "RUNNING") {
      throw new ConflictException(`Cannot reinstall while ${server.state}`);
    }
    await this.prisma.server.update({
      where: { id },
      data: { state: "REINSTALLING" },
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
    if (!server) throw new NotFoundException("Server not found");

    const slug = server.template?.slug;
    if (!slug?.startsWith("minecraft-")) {
      throw new BadRequestException("This server is not a Minecraft server");
    }
    if (!STOPPED_STATES.includes(server.state) && server.state !== "RUNNING") {
      throw new ConflictException(
        `Cannot change version while ${server.state}`,
      );
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
        data: { environment, dockerImage, state: "REINSTALLING" },
      }),
      // Keep an explicit per-server override (if one exists) in sync so it can't
      // shadow the new value in the install spec.
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: "MINECRAFT_VERSION" },
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
    dto: {
      loader: string;
      version?: string;
      loaderVersion?: string;
      freshStart?: boolean;
    },
  ): Promise<{ accepted: true; loader: string; version: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (server.template?.slug !== "minecraft") {
      throw new BadRequestException("This server is not a Minecraft server");
    }
    if (!isMinecraftLoader(dto.loader)) {
      throw new BadRequestException(`Unknown loader: ${dto.loader}`);
    }
    if (!STOPPED_STATES.includes(server.state) && server.state !== "RUNNING") {
      throw new ConflictException(`Cannot reconfigure while ${server.state}`);
    }

    const { concrete } = await this.applyMinecraftEnv(id, dto, "REINSTALLING");

    // A loader-family change (e.g. Forge↔Fabric, or modded↔vanilla) leaves the
    // old mods/world incompatible with the new loader — the caller opts into a
    // clean slate via freshStart, otherwise we preserve the world as before.
    await this.reinstallQueue.add(JOB.REINSTALL, {
      serverId: id,
      preserveData: !dto.freshStart,
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
    state?: "REINSTALLING",
  ): Promise<{ concrete: string; loaderVersion: string }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { template: true },
    });
    if (!server?.template) throw new NotFoundException("Server not found");
    if (!isMinecraftLoader(dto.loader)) {
      throw new BadRequestException(`Unknown loader: ${dto.loader}`);
    }

    const loaderVersion = dto.loaderVersion?.trim() || "latest";
    const concrete = await this.mcResolver.resolveByLoader(
      dto.loader,
      dto.version ?? "latest",
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
        where: { serverId: id, envName: "LOADER" },
        data: { value: dto.loader },
      }),
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: "MINECRAFT_VERSION" },
        data: { value: concrete },
      }),
      this.prisma.serverVariable.updateMany({
        where: { serverId: id, envName: "LOADER_VERSION" },
        data: { value: loaderVersion },
      }),
    ]);

    return { concrete, loaderVersion };
  }

  // ---- resize (upgrade/downgrade) ----------------------------------------

  async resize(id: string, dto: ResizeServerDto): Promise<PublicServer> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException("Server not found");

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
        throw new ConflictException("Node lacks capacity for this upgrade");
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
      omit: SERVER_SECRET_OMIT,
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
    // Push the refreshed spec too: a RAM change alters the derived
    // SERVER_MEMORY (-Xmx) in the spec's env, so without this the cgroup grows
    // but the JVM keeps its old heap until the next reinstall. Best-effort;
    // takes effect on the next server restart.
    await this.pushSpecReload(server.nodeId, id);
    return updated;
  }

  // ---- console command (one-shot) ----------------------------------------

  async sendCommand(id: string, command: string): Promise<{ accepted: true }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (server.state !== "RUNNING" && server.state !== "STARTING") {
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
    if (!server) throw new NotFoundException("Server not found");
    return {
      startupCommand: server.startupCommand,
      dockerImage: server.dockerImage,
    };
  }

  /** Rename / re-describe a server (Settings → General). Cosmetic only. */
  async updateDetails(
    id: string,
    dto: { name?: string; description?: string | null },
  ): Promise<PublicServer> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException("Server name cannot be empty");
    }
    return this.prisma.server.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
      },
      omit: SERVER_SECRET_OMIT,
    });
  }

  async setStartup(
    id: string,
    dto: { startupCommand?: string; dockerImage?: string },
  ): Promise<PublicServer> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException("Server not found");
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
      omit: SERVER_SECRET_OMIT,
    });
  }

  // ---- upgrade (resize alias + price preview) ----------------------------

  /**
   * Customer-initiated plan change. An UPGRADE (more expensive) raises a prorated
   * invoice immediately and holds the server on its CURRENT configuration until
   * that invoice is paid — only then are the new limits applied (via
   * BillingService.applyPendingPlanChange on settlement). A cheaper plan is
   * scheduled to apply at the next renewal. A no-cost change applies immediately.
   * Legacy flat-product resizes still apply immediately.
   */
  async upgrade(id: string, dto: UpgradeServerDto): Promise<PlanChangeResult> {
    // Tiered game products upgrade by HARDWARE TIER; per-slot products upgrade by
    // SLOT COUNT (resources + price scale together); a legacy flat product
    // resizes raw resources.
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      // The row is embedded verbatim in the scheduled/invoiced results, so
      // node and subscription are narrowed projections (no processor linkage,
      // no attribution); the apply-now path re-fetches the full node for its
      // agent call (see applyPlanChangeNow).
      omit: SERVER_SECRET_OMIT,
      include: {
        node: { select: NODE_PUBLIC_SELECT },
        subscription: { select: PLAN_CHANGE_SUBSCRIPTION_SELECT },
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    const sub = server.subscription;
    const product = sub?.product;

    // ---- Hardware-tier change (move to a higher/lower tier) ----------------
    if (dto.hardwareTierId) {
      if (!sub || !product) {
        throw new BadRequestException("Server has no subscription to change");
      }
      const tier = await this.prisma.hardwareTier.findFirst({
        where: { id: dto.hardwareTierId, productId: product.id },
        include: { prices: true },
      });
      if (!tier)
        throw new BadRequestException("Tier does not belong to this product");
      if (!tier.isActive)
        throw new BadRequestException("That tier is not available");

      const currentPrice = await this.prisma.price.findUnique({
        where: { id: sub.priceId },
        select: { currency: true, amountMinor: true },
      });
      const currency = currentPrice?.currency ?? "USD";
      const newPrice = tier.prices.find(
        (p) =>
          p.interval === sub.interval && p.currency === currency && p.isActive,
      );
      if (!newPrice) {
        throw new BadRequestException(
          `That tier has no ${sub.interval.toLowerCase()} (${currency}) price`,
        );
      }

      // The node must absorb the delta when growing.
      const cap = await this.nodes.capacity(server.nodeId);
      if (
        tier.memoryMb - server.memoryMb > cap.memory.free ||
        tier.cpuCores - server.cpuCores > cap.cpu.free ||
        tier.diskMb - server.diskMb > cap.disk.free
      ) {
        throw new ConflictException("Node lacks capacity for this upgrade");
      }

      return this.stagePlanChange(
        server,
        sub,
        {
          priceId: newPrice.id,
          hardwareTierId: tier.id,
          slots: tier.recommendedPlayers ?? server.slots ?? sub.slots,
          cpuCores: tier.cpuCores,
          memoryMb: tier.memoryMb,
          diskMb: tier.diskMb,
        },
        currentPrice?.amountMinor ?? 0,
        newPrice.amountMinor,
        currency,
        `Plan change to ${tier.name}`,
      );
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
        throw new ConflictException("Node lacks capacity for this upgrade");
      }
      const perSlotPrice = await this.prisma.price.findUnique({
        where: { id: sub!.priceId },
        select: { currency: true, amountMinor: true },
      });
      const perSlotMinor = perSlotPrice?.amountMinor ?? 0;
      return this.stagePlanChange(
        server,
        sub!,
        {
          priceId: sub!.priceId,
          hardwareTierId: null,
          slots,
          cpuCores: limits.cpuCores,
          memoryMb: limits.memoryMb,
          diskMb: limits.diskMb,
        },
        perSlotMinor * sub!.slots,
        perSlotMinor * slots,
        perSlotPrice?.currency ?? "USD",
        `Plan change to ${slots} slots`,
      );
    }

    return { status: "applied", server: await this.resize(id, dto) };
  }

  // ---- plan-change staging (invoice-gated upgrades, scheduled downgrades) --

  /**
   * Decide how a plan change is applied based on the recurring price delta and
   * raise the appropriate side-effects. See `upgrade` for the policy.
   */
  private async stagePlanChange(
    server: ServerWithNode,
    sub: PlanChangeSubscription,
    target: PlanChangeTarget,
    currentRecurringMinor: number,
    newRecurringMinor: number,
    currency: string,
    description: string,
  ): Promise<PlanChangeResult> {
    // One staged change at a time, so a customer can't stack invoices/changes.
    const existing = await this.prisma.pendingPlanChange.findUnique({
      where: { subscriptionId: sub.id },
    });
    if (existing) {
      throw new ConflictException(
        existing.invoiceId
          ? "An upgrade invoice is already awaiting payment for this server — pay or cancel it first."
          : "A plan change is already scheduled for this server.",
      );
    }

    const deltaRecurring = newRecurringMinor - currentRecurringMinor;

    // Cheaper plan: schedule for the next renewal so the customer keeps the
    // resources they've already paid for until the period rolls.
    if (deltaRecurring < 0) {
      await this.createPendingOrConflict({
        id: uuidv7(),
        subscriptionId: sub.id,
        applyAtPeriodEnd: true,
        ...target,
      });
      return { status: "scheduled", server, effectiveAt: sub.currentPeriodEnd };
    }

    const prorated =
      deltaRecurring > 0 ? this.proratedAmount(deltaRecurring, sub) : 0;

    // No incremental cost (same price, or prorates to ~0 at the period's tail):
    // apply immediately.
    if (prorated <= 0) {
      return {
        status: "applied",
        server: await this.applyPlanChangeNow(server, target),
      };
    }

    // Paid upgrade. Claim the single pending-change slot FIRST — the unique
    // subscriptionId constraint serialises concurrent requests — so a double
    // submit can't create two invoices. Only then bill and attach the invoice.
    const pending = await this.createPendingOrConflict({
      id: uuidv7(),
      subscriptionId: sub.id,
      applyAtPeriodEnd: false,
      ...target,
    });
    let invoice;
    try {
      invoice = await this.billing.createUpgradeInvoice(sub.id, {
        amountMinor: prorated,
        description: `${description} (prorated)`,
      });
    } catch (err) {
      // Billing failed — release the claimed slot so the customer can retry,
      // and never leave an orphan staged change behind.
      await this.prisma.pendingPlanChange
        .deleteMany({ where: { id: pending.id } })
        .catch(() => undefined);
      throw err;
    }
    await this.prisma.pendingPlanChange.update({
      where: { id: pending.id },
      data: { invoiceId: invoice.id },
    });
    return {
      status: "invoiced",
      server,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency,
    };
  }

  /**
   * Create the single pending plan change for a subscription, translating the
   * unique-constraint race (concurrent double-submit) into a clean
   * ConflictException instead of an unhandled 500.
   */
  private async createPendingOrConflict(
    data: Prisma.PendingPlanChangeUncheckedCreateInput,
  ): Promise<PendingPlanChange> {
    try {
      return await this.prisma.pendingPlanChange.create({ data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "A plan change is already in progress for this server — pay or cancel it first.",
        );
      }
      throw err;
    }
  }

  /** Prorate a recurring delta over the time remaining in the current period. */
  private proratedAmount(
    deltaRecurringMinor: number,
    sub: { currentPeriodStart: Date; currentPeriodEnd: Date },
  ): number {
    const now = Date.now();
    const full =
      sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime();
    if (full <= 0) return deltaRecurringMinor; // safety: bill the full delta
    const remaining = Math.max(
      0,
      Math.min(sub.currentPeriodEnd.getTime() - now, full),
    );
    return Math.round((deltaRecurringMinor * remaining) / full);
  }

  /** Apply a plan change to the subscription + server right now and reconfigure. */
  private async applyPlanChangeNow(
    server: ServerWithNode,
    target: PlanChangeTarget,
  ): Promise<PublicServer> {
    await this.prisma.subscription.update({
      where: { id: server.subscriptionId! },
      data: {
        priceId: target.priceId,
        hardwareTierId: target.hardwareTierId,
        slots: target.slots,
      },
    });
    const updated = await this.prisma.server.update({
      where: { id: server.id },
      data: {
        cpuCores: target.cpuCores,
        memoryMb: target.memoryMb,
        diskMb: target.diskMb,
        slots: target.slots,
      },
      omit: SERVER_SECRET_OMIT,
    });
    // `server.node` is the customer-facing public projection; the agent client
    // needs the full row (daemon address + pinned cert), so fetch it fresh.
    const node = await this.prisma.node.findUniqueOrThrow({
      where: { id: server.nodeId },
    });
    await this.agent.reconfigure(node, {
      serverId: server.id,
      limits: {
        cpuCores: updated.cpuCores,
        memoryMb: updated.memoryMb,
        swapMb: updated.swapMb,
        diskMb: updated.diskMb,
        ioWeight: updated.ioWeight,
      },
    });
    // Refresh the agent's cached spec too: reconfigure only moves cgroup
    // limits, while derived env (SERVER_MEMORY → -Xmx) lives in the spec used
    // on the next start. Without this, a plan change keeps the old JVM heap.
    await this.pushSpecReload(server.nodeId, server.id);
    return updated;
  }

  /**
   * Cancel a staged plan change: void the pending upgrade invoice (which also
   * clears the staged change) or drop a scheduled downgrade. Lets a customer
   * back out of a change they no longer want — and unblocks further changes,
   * since only one is allowed at a time.
   */
  async cancelPlanChange(id: string): Promise<{ canceled: true }> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      select: { subscriptionId: true },
    });
    if (!server?.subscriptionId) {
      throw new NotFoundException("Server has no subscription");
    }
    const pending = await this.prisma.pendingPlanChange.findUnique({
      where: { subscriptionId: server.subscriptionId },
    });
    if (!pending) {
      throw new NotFoundException("No pending plan change to cancel");
    }
    if (pending.invoiceId) {
      // Upgrade awaiting payment: voiding the invoice also clears the staged change.
      await this.billing.voidInvoice(pending.invoiceId);
    } else {
      await this.prisma.pendingPlanChange.delete({ where: { id: pending.id } });
    }
    return { canceled: true };
  }

  /** Upgrade context for the upgrade page: hardware tiers (tiered products) or
   *  per-slot scaling (voice/legacy), plus the server's current resources. */
  async upgradeOptions(id: string): Promise<{
    perSlot: boolean;
    currency: string;
    interval: string;
    /** Fraction of the current billing period still remaining (0..1). The web
     *  multiplies the recurring price increase by this to show the prorated
     *  amount due today for an upgrade. */
    prorationFactor: number;
    /** A staged plan change awaiting payment (upgrade) or the next renewal
     *  (downgrade), so the page can offer to pay or cancel it. */
    pendingChange: {
      kind: "upgrade" | "downgrade";
      invoiceId: string | null;
      effectiveAt: string | null;
    } | null;
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
                  orderBy: { sortOrder: "asc" },
                  include: { prices: true },
                },
              },
            },
          },
        },
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    const sub = server.subscription;
    const product = sub?.product;
    const price = product?.prices.find((p) => p.id === sub?.priceId);
    const currency = price?.currency ?? "USD";
    const interval = sub?.interval ?? "MONTHLY";

    // Fraction of the current period still to run — the basis for the prorated
    // upgrade charge the web previews (matches `proratedAmount`).
    const periodFull = sub
      ? sub.currentPeriodEnd.getTime() - sub.currentPeriodStart.getTime()
      : 0;
    const periodRemaining = sub
      ? Math.max(
          0,
          Math.min(sub.currentPeriodEnd.getTime() - Date.now(), periodFull),
        )
      : 0;
    const prorationFactor = periodFull > 0 ? periodRemaining / periodFull : 1;

    const pending = sub
      ? await this.prisma.pendingPlanChange.findUnique({
          where: { subscriptionId: sub.id },
        })
      : null;
    const pendingChange = pending
      ? {
          kind: (pending.invoiceId ? "upgrade" : "downgrade") as
            "upgrade" | "downgrade",
          invoiceId: pending.invoiceId,
          effectiveAt: pending.applyAtPeriodEnd
            ? sub!.currentPeriodEnd.toISOString()
            : null,
        }
      : null;

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
          (p) =>
            p.interval === interval && p.currency === currency && p.isActive,
        )?.amountMinor ?? null,
    }));

    return {
      perSlot: !!product?.perSlot,
      currency,
      interval,
      prorationFactor,
      pendingChange,
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
    if (!server) throw new NotFoundException("Server not found");

    const sub = server.subscription;
    const currentPrice = sub?.product.prices.find((p) => p.id === sub.priceId);
    const currency = currentPrice?.currency ?? "USD";
    const interval = sub?.interval ?? "MONTHLY";
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
        type: "GAME_SERVER",
        cpuCores: { gte: wantCpu },
        memoryMb: { gte: wantMem },
        diskMb: { gte: wantDisk },
      },
      include: { prices: { where: { interval, isActive: true } } },
    });
    let newAmount = currentAmount;
    for (const product of candidates) {
      const price = product.prices.find((p) => p.currency === currency);
      if (
        price &&
        (newAmount === currentAmount || price.amountMinor < newAmount)
      ) {
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
      include: {
        subscription: { include: { product: true } },
        template: { include: { category: { select: { slug: true } } } },
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    // Voice servers keep their identity for the life of the server — game
    // switching doesn't apply, so there's nothing to switch to.
    if (server.serverType === "VOICE_SERVER") return [];

    const allowed = server.subscription?.product.allowedTemplateIds ?? [];
    const templates = await this.prisma.gameTemplate.findMany({
      where: allowed.length > 0 ? { id: { in: allowed } } : {},
      include: { category: { select: { slug: true } } },
      orderBy: { name: "asc" },
    });
    // Never offer voice templates as switch targets — voice servers are a
    // separate product line and can't be swapped with game servers.
    return templates.filter((t) => !this.isVoiceTemplate(t));
  }

  /**
   * Classifies a TEMPLATE as voice (TeamSpeak / the "voice" category). Used only
   * where there is no Server row to read serverType from — i.e. deciding a
   * server's type AT CREATION and rejecting voice templates as switch targets.
   * For an existing server, prefer the authoritative `server.serverType`.
   */
  private isVoiceTemplate(
    template: { slug: string; category?: { slug: string } | null } | null,
  ): boolean {
    if (!template) return false;
    return (
      template.slug.startsWith("teamspeak") ||
      template.category?.slug === "voice"
    );
  }

  /** Authoritative ServerType for a template, set once at creation. WEB templates
   *  (kind=WEB) provision app-container web apps; voice via slug/category; else a
   *  game server. Mirrors the create + adminCreate paths so they always agree. */
  private serverTypeForTemplate(
    template: {
      slug: string;
      kind?: string | null;
      category?: { slug: string } | null;
    } | null,
  ): "WEB_APP" | "VOICE_SERVER" | "GAME_SERVER" | "BOT_APP" {
    if (template?.kind === "WEB") return "WEB_APP";
    // Bot containers don't need the HTTP reverse proxy, so they're NOT WEB_APP
    // (which gates onto web-enabled nodes) — they schedule on any node.
    if (template?.kind === "BOT") return "BOT_APP";
    return this.isVoiceTemplate(template) ? "VOICE_SERVER" : "GAME_SERVER";
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
    if (!schedule) throw new NotFoundException("Schedule not found");

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
      action: "suspend",
      reason,
    });
    await this.prisma.server.update({
      where: { id },
      data: { suspendedAt: new Date(), state: "SUSPENDED" },
    });
    return { accepted: true };
  }

  async unsuspend(id: string): Promise<{ accepted: true }> {
    await this.suspensionQueue.add(JOB.SUSPEND, {
      serverId: id,
      action: "unsuspend",
    });
    await this.prisma.server.update({
      where: { id },
      data: { suspendedAt: null, state: "OFFLINE" },
    });
    return { accepted: true };
  }

  async delete(id: string): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    // Tear down on the node, then soft-delete and free allocations.
    try {
      await this.agent.deleteServer(server.node, server.id);
    } catch (e: any) {
      this.logger.warn(
        `agent delete failed (continuing soft-delete): ${e.message}`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.allocation.updateMany({
        where: { serverId: id },
        data: { serverId: null, isPrimary: false },
      }),
      this.prisma.server.update({
        where: { id },
        data: { deletedAt: new Date(), state: "OFFLINE" },
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
   * The allocation `ip` is the *advertised* address (node.fqdn) shown to players
   * and injected as SERVER_IP; the agent binds the published port to all host
   * interfaces (0.0.0.0) regardless, so it stays reachable on NAT'd cloud nodes.
   *
   * TODO(impl): multi-IP nodes (a per-allocation BindIP override exists in the
   *   agent spec but the panel doesn't populate it yet).
   */
  private async assignPrimaryAllocation(
    nodeId: string,
    serverId: string,
  ): Promise<number> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        fqdn: true,
        gameDomain: true,
        allocationPortStart: true,
        allocationPortEnd: true,
      },
    });
    if (!node) throw new NotFoundException("Node not found");

    // Branded per-server hostname (GPortal-style) when the node has a wildcard
    // game domain; otherwise null and we advertise the node fqdn as before.
    const srv = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      select: { shortId: true },
    });
    const alias = buildAllocationAlias(srv.shortId, node.gameDomain);

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
            alias,
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
          e.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        throw e;
      }
    }

    if (!port) {
      throw new ConflictException("No free port available on the node");
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
              alias,
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
            e.code === "P2002"
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

  // ---- Simple Voice Chat (admin-granted dedicated UDP port) ---------------

  /** Label used to mark a server's dedicated Simple Voice Chat allocation. */
  private static readonly VOICE_LABEL = "voicechat";

  /**
   * Current voice-chat state for a server: whether a dedicated port is
   * allocated, and if so its host + port.
   */
  async voiceChatStatus(
    serverId: string,
  ): Promise<{ enabled: boolean; port: number | null; ip: string | null }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    const alloc = await this.prisma.allocation.findFirst({
      where: { serverId, label: ServersService.VOICE_LABEL },
      select: { port: true, ip: true },
    });
    return {
      enabled: !!alloc,
      port: alloc?.port ?? null,
      ip: alloc?.ip ?? null,
    };
  }

  /**
   * Grant a server a dedicated UDP port for Simple Voice Chat (admin action,
   * typically off a support ticket). Reserves a free port on the server's node,
   * marks it `voicechat`, and pushes the updated spec to the agent so the port
   * publishes on the server's NEXT restart. Idempotent — returns the existing
   * port if already enabled. The customer then sets `port=<port>` in
   * voicechat-server.properties (see the KB article) and restarts.
   */
  async enableVoiceChat(
    serverId: string,
  ): Promise<{ port: number; ip: string; alreadyEnabled: boolean }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        id: true,
        nodeId: true,
        node: true,
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    // Idempotent: reuse an existing voice allocation.
    const existing = await this.prisma.allocation.findFirst({
      where: { serverId, label: ServersService.VOICE_LABEL },
      select: { port: true, ip: true },
    });
    if (existing) {
      return { port: existing.port, ip: existing.ip, alreadyEnabled: true };
    }

    const node = server.node;
    const rangeStart = node.allocationPortStart || PORT_RANGE_START;
    const rangeEnd = node.allocationPortEnd || PORT_RANGE_END;

    const MAX_ATTEMPTS = 5;
    let port = 0;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const taken = await this.prisma.allocation.findMany({
        where: {
          nodeId: server.nodeId,
          port: { gte: rangeStart, lte: rangeEnd },
        },
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
            nodeId: server.nodeId,
            ip: node.fqdn,
            port: candidate,
            serverId,
            isPrimary: false,
            label: ServersService.VOICE_LABEL,
          },
        });
        port = candidate;
        break;
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        throw e;
      }
    }
    if (!port) {
      throw new ConflictException("No free port available on the node");
    }

    await this.pushSpecReload(server.nodeId, serverId);
    return { port, ip: node.fqdn, alreadyEnabled: false };
  }

  /** Remove a server's dedicated voice-chat port. Publishes on next restart. */
  async disableVoiceChat(serverId: string): Promise<{ disabled: boolean }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, nodeId: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    const res = await this.prisma.allocation.deleteMany({
      where: { serverId, label: ServersService.VOICE_LABEL },
    });
    if (res.count > 0) await this.pushSpecReload(server.nodeId, serverId);
    return { disabled: res.count > 0 };
  }

  /**
   * Admin comp of the Express Backups (R2/offsite) add-on for a server, with no
   * charge. Sets `Subscription.expressBackupsComp` and points the server's
   * routing flag (`Server.expressBackups`) at (paid || comp), so backups go
   * offsite immediately. Turning the comp OFF reverts routing to the paid flag,
   * so a customer who actually pays keeps offsite storage. Billing is untouched
   * — the per-cycle add-on line keys on the PAID flag only, never the comp.
   */
  async setExpressBackupsComp(
    serverId: string,
    on: boolean,
  ): Promise<{
    expressBackups: boolean;
    comped: boolean;
    paid: boolean;
  }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        id: true,
        subscriptionId: true,
        subscription: { select: { id: true, expressBackups: true } },
      },
    });
    if (!server) throw new NotFoundException("Server not found");
    if (!server.subscriptionId || !server.subscription) {
      // Admin/internal server with no billing attached: there is no paid
      // add-on to distinguish from, so the routing flag on the server row IS
      // the comp state. Toggle it directly.
      await this.prisma.server.update({
        where: { id: serverId },
        data: { expressBackups: on },
      });
      return { expressBackups: on, comped: on, paid: false };
    }
    const paid = server.subscription.expressBackups;
    const routing = paid || on;

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: server.subscription.id },
        data: { expressBackupsComp: on },
      }),
      // Point routing for EVERY live server on the subscription (a sub can hold
      // one server today, but keep it correct if that ever changes).
      this.prisma.server.updateMany({
        where: { subscriptionId: server.subscriptionId, deletedAt: null },
        data: { expressBackups: routing },
      }),
    ]);

    return { expressBackups: routing, comped: on, paid };
  }

  /**
   * Push a server's current spec (post allocation change) to its agent without a
   * reinstall. Best-effort: an offline node/agent just means the change applies
   * on the agent's next reconnect. Requires agent v1.2.4+ for /reload; older
   * agents pick the change up on reconnect regardless.
   */
  /**
   * Toggle crash auto-restart for a server. The flag rides in the server's
   * environment as REFX_AUTO_RESTART ("true"/"false"; the agent treats absence
   * as ON), so it reaches the agent through the normal spec channel — no
   * schema or protocol change. Applies from the next crash after the agent has
   * the refreshed spec (pushed immediately; offline agents pick it up on
   * reconnect).
   */
  async setAutoRestart(
    serverId: string,
    enabled: boolean,
  ): Promise<{ enabled: boolean }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { id: true, nodeId: true, environment: true },
    });
    if (!server) throw new NotFoundException("Server not found");
    const environment = {
      ...((server.environment as Record<string, unknown>) ?? {}),
      REFX_AUTO_RESTART: enabled ? "true" : "false",
    } as Prisma.InputJsonObject;
    await this.prisma.server.update({
      where: { id: serverId },
      data: { environment },
    });
    await this.pushSpecReload(server.nodeId, serverId);
    return { enabled };
  }

  /**
   * Public entry point to refresh a server's cached agent spec after an
   * out-of-band config change (e.g. the Java selector), so the next restart
   * uses it without a full reinstall. Best-effort — see {@link pushSpecReload}.
   */
  async reloadSpec(serverId: string): Promise<void> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: { nodeId: true },
    });
    if (server?.nodeId) await this.pushSpecReload(server.nodeId, serverId);
  }

  private async pushSpecReload(
    nodeId: string,
    serverId: string,
  ): Promise<void> {
    try {
      const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
      if (!node) return;
      const spec = await this.nodes.buildServerInstallSpec(serverId);
      await this.agent.reloadServer(node, spec as never);
    } catch (e) {
      this.logger.warn(
        `spec reload push failed for server ${serverId} (applies on next agent reconnect): ${
          (e as Error).message
        }`,
      );
    }
  }

  private assertTemplateAllowed(allowed: string[], templateId: string): void {
    // Empty whitelist = all templates permitted.
    if (allowed.length > 0 && !allowed.includes(templateId)) {
      throw new ForbiddenException(
        "This game is not available on your current plan",
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
      env["MINECRAFT_VERSION"] != null
        ? String(env["MINECRAFT_VERSION"])
        : "latest";
    if (templateSlug === "minecraft") {
      // Unified egg: loader is per-server (LOADER env), not in the slug.
      env["MINECRAFT_VERSION"] = await this.mcResolver.resolveByLoader(
        String(env["LOADER"] ?? "paper"),
        requested,
      );
    } else if (templateSlug?.startsWith("minecraft-")) {
      env["MINECRAFT_VERSION"] = await this.mcResolver.resolve(
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
    if (template.slug !== "minecraft") return template.startupCommand;
    const loader = String((environment ?? {})["LOADER"] ?? "paper");
    return isMinecraftLoader(loader)
      ? LOADER_STARTUP[loader]
      : template.startupCommand;
  }

  private resolveDockerImage(
    images: Prisma.JsonValue,
    environment?: Record<string, unknown> | null,
  ): string | undefined {
    const base = this.firstDockerImage(images);
    if (!isJavaImage(base)) return base;
    const env = (environment ?? {}) as Record<string, unknown>;
    const mc =
      env["MINECRAFT_VERSION"] != null
        ? String(env["MINECRAFT_VERSION"])
        : "latest";
    return resolveJavaImage(base, mc, "jre");
  }

  private firstDockerImage(images: Prisma.JsonValue): string | undefined {
    if (images && typeof images === "object" && !Array.isArray(images)) {
      const values = Object.values(images as Record<string, unknown>);
      if (values.length) return String(values[0]);
    }
    return undefined;
  }
}
