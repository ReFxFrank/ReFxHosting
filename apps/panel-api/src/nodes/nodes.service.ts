import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Node, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CryptoService } from "../common/crypto/crypto.service";
import { NodeAgentClient } from "../agent/agent.client";
import { deriveSigningKey } from "../agent/agent.signing";
import {
  isJavaImage,
  javaImage,
  JAVA_VERSION_VAR,
  parseJavaOverride,
  resolveJavaImage,
} from "../common/util/java-version.util";
import { uuidv7 } from "../common/util/uuid";
import {
  Paginated,
  PaginationDto,
  paginate,
} from "../common/dto/pagination.dto";
import {
  PORT_RANGE_START,
  PORT_RANGE_END,
  normalizeGameDomain,
} from "../servers/allocation-port.util";
import { jvmHeapMb, SERVER_MEMORY_VAR } from "../servers/server-memory.util";
import { CreateNodeDto, UpdateNodeDto } from "./dto/node.dto";

/** Loose UUID shape check (any version), used to avoid Prisma P2023 on bad ids. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

/**
 * How long a freshly-minted node bootstrap token is valid for. The token is a
 * single-use bearer credential that yields the node's signing key, so it is
 * deliberately short-lived: the operator installs the agent and registers
 * within this window, or rotates the token (admin "regenerate") for a new one.
 */
const BOOTSTRAP_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * A node whose agent hasn't heartbeated for this long is considered OFFLINE.
 * Agents heartbeat every ~15s, so this is 8 consecutive misses — long enough
 * to ride out a blip or agent self-update, short enough that the admin panel
 * and the scheduler stop trusting a dead node quickly. Matches the admin UI's
 * "recent heartbeat" convention (2 minutes).
 */
export const NODE_OFFLINE_AFTER_MS = 120_000;

/**
 * Normalize a recurring price (in minor units) to an equivalent MONTHLY amount,
 * so revenue across mixed billing intervals is comparable on the margin view.
 * A month is treated as 1/12 of a year (weeks annualized at 52/12).
 */
function toMonthlyMinor(amountMinor: number, interval: string): number {
  switch (interval) {
    case "WEEKLY":
      return (amountMinor * 52) / 12;
    case "BIWEEKLY":
      return (amountMinor * 26) / 12;
    case "MONTHLY":
      return amountMinor;
    case "QUARTERLY":
      return amountMinor / 3;
    case "SEMIANNUAL":
      return amountMinor / 6;
    case "ANNUAL":
      return amountMinor / 12;
    default:
      return amountMinor;
  }
}

/** Server include shape needed to build a wire ServerInstallSpec. */
const INSTALL_SPEC_INCLUDE = {
  template: { include: { variables: true } },
  allocations: true,
  variables: true,
} satisfies Prisma.ServerInclude;

type ServerWithSpec = Prisma.ServerGetPayload<{
  include: typeof INSTALL_SPEC_INCLUDE;
}>;

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);
  private readonly secretsEncKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly agent: NodeAgentClient,
    config: ConfigService,
  ) {
    this.secretsEncKey = config.get<string>("secretsEncKey")!;
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
      orderBy: { name: "asc" },
    });
  }

  /** Create a location/region. Codes are unique (used as the human handle). */
  async createRegion(dto: { code: string; name: string; country: string }) {
    const code = dto.code.trim().toLowerCase();
    const existing = await this.prisma.region.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(
        `A location with code "${code}" already exists`,
      );
    }
    return this.prisma.region.create({
      data: {
        id: uuidv7(),
        code,
        name: dto.name.trim(),
        country: dto.country.trim(),
      },
      select: this.regionSelect,
    });
  }

  async updateRegion(
    id: string,
    dto: { code?: string; name?: string; country?: string },
  ) {
    const region = await this.prisma.region.findUnique({ where: { id } });
    if (!region) throw new NotFoundException("Location not found");
    const data: { code?: string; name?: string; country?: string } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.country !== undefined) data.country = dto.country.trim();
    if (dto.code !== undefined) {
      const code = dto.code.trim().toLowerCase();
      const clash = await this.prisma.region.findFirst({
        where: { code, id: { not: id } },
      });
      if (clash) {
        throw new BadRequestException(
          `A location with code "${code}" already exists`,
        );
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
    if (!region) throw new NotFoundException("Location not found");

    // Active nodes block deletion — move or delete them first.
    const active = await this.prisma.node.count({
      where: { regionId: id, deletedAt: null },
    });
    if (active > 0) {
      throw new BadRequestException(
        "Cannot delete a location that still has nodes; move or delete them first",
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
        e.code === "P2003"
      ) {
        // A removed node still has servers attached (Server→Node is RESTRICT).
        throw new BadRequestException(
          "A removed node in this location still has servers attached — delete those servers first.",
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

  async create(
    dto: CreateNodeDto,
  ): Promise<{ node: Node; bootstrapToken: string }> {
    const bootstrapToken = this.crypto.token(32);
    const regionId = await this.resolveRegionId(dto.regionId);
    const portStart = dto.allocationPortStart ?? PORT_RANGE_START;
    const portEnd = dto.allocationPortEnd ?? PORT_RANGE_END;
    if (portStart > portEnd) {
      throw new BadRequestException(
        "allocationPortStart must be <= allocationPortEnd",
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
        // Single-use + time-boxed: the token must be redeemed within the TTL and
        // is consumed on first successful registration.
        bootstrapTokenExpiresAt: new Date(Date.now() + BOOTSTRAP_TOKEN_TTL_MS),
        bootstrapTokenUsedAt: null,
        cpuCores: dto.cpuCores,
        memoryMb: dto.memoryMb,
        diskMb: dto.diskMb,
        cpuOvercommit: dto.cpuOvercommit ?? 1.0,
        memOvercommit: dto.memOvercommit ?? 1.0,
        daemonPort: dto.daemonPort ?? 8443,
        sftpPort: dto.sftpPort ?? 2022,
        allocationPortStart: portStart,
        allocationPortEnd: portEnd,
        gameDomain: normalizeGameDomain(dto.gameDomain),
        supportsWeb: dto.supportsWeb ?? false,
        monthlyCostMinor: dto.monthlyCostMinor ?? null,
        costCurrency: dto.costCurrency ?? "USD",
        provider: dto.provider ?? null,
        state: "PROVISIONING",
      },
    });
    return { node, bootstrapToken };
  }

  /**
   * Shape returned to the admin UI: the Node row plus its region (name +
   * country), the single most-recent NodeHeartbeat, and a live (non-deleted)
   * server count. The UI renders gauges from the heartbeat against the node's
   * advertised capacity and shows the count in the Servers column.
   */
  private readonly adminNodeInclude = {
    region: { select: { id: true, code: true, name: true, country: true } },
    heartbeats: {
      orderBy: { recordedAt: "desc" as const },
      take: 1,
    },
    _count: {
      select: { servers: { where: { deletedAt: null } } },
    },
  };

  /** Flatten `heartbeats` into `latestHeartbeat` and `_count` into `servers`. */
  private decorate<
    T extends {
      heartbeats?: { recordedAt: Date }[];
      _count?: { servers: number };
    },
  >(node: T) {
    const { heartbeats, _count, ...rest } = node;
    return {
      ...rest,
      latestHeartbeat: heartbeats?.[0] ?? null,
      servers: _count?.servers ?? 0,
    };
  }

  async list(pagination: PaginationDto): Promise<Paginated<unknown>> {
    const where = { deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.node.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: "desc" },
        include: this.adminNodeInclude,
      }),
      this.prisma.node.count({ where }),
    ]);
    return paginate(
      data.map((n) => this.decorate(n)),
      total,
      pagination,
    );
  }

  async get(id: string): Promise<Node> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
      include: this.adminNodeInclude,
    });
    if (!node) throw new NotFoundException("Node not found");
    return this.decorate(node) as unknown as Node;
  }

  /**
   * Measure panel -> agent round-trip latency by hitting the agent's `/healthz`
   * route (panel → agent, inbound on the daemon port). Returns elapsed ms + a
   * `reachable` flag. Also returns the age of the node's latest heartbeat (agent
   * → panel, outbound) so the UI can distinguish "agent alive but its API port
   * is unreachable" (firewall) from "agent down". `reachable` false on
   * timeout/connection failure.
   *
   * Methodology: the first request is an untimed WARM-UP — it pays DNS + TCP +
   * the TLS handshake (the connection pool closes idle sockets between the
   * UI's ~10-30s polls, so a naive single sample measures connection setup,
   * ~3-4 round-trips, not latency — that's how a 20ms link used to read as
   * 200-500ms and jump around). The timed samples then reuse the warm
   * connection immediately, and we report the fastest of three: the minimum is
   * the standard estimator for the latency floor, since noise is one-sided.
   */
  async ping(id: string): Promise<{
    ms: number | null;
    reachable: boolean;
    heartbeatAgeMs: number | null;
  }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
      include: { heartbeats: { orderBy: { recordedAt: "desc" }, take: 1 } },
    });
    if (!node) throw new NotFoundException("Node not found");
    const hb = node.heartbeats[0];
    const heartbeatAgeMs = hb
      ? Date.now() - new Date(hb.recordedAt).getTime()
      : null;
    try {
      // Warm-up (untimed): establish DNS/TCP/TLS so the samples below measure
      // the request round-trip on a pooled connection, not connection setup.
      await this.agent.fetchAgentStatus(node);
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        // performance.now() is monotonic (immune to NTP clock steps).
        const started = performance.now();
        await this.agent.fetchAgentStatus(node);
        samples.push(performance.now() - started);
      }
      return {
        ms: Math.max(1, Math.round(Math.min(...samples))),
        reachable: true,
        heartbeatAgeMs,
      };
    } catch {
      return { ms: null, reachable: false, heartbeatAgeMs };
    }
  }

  /**
   * Trust-on-first-use: capture the agent's current TLS cert and pin it on the
   * node, so subsequent panel→agent calls verify against it (when
   * AGENT_TLS_PINNING is enabled). Returns the fingerprint for display.
   */
  async pinAgentCert(id: string): Promise<{ sha256: string }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    let captured: { pem: string; sha256: string };
    try {
      captured = await this.agent.captureCert(node);
    } catch (e) {
      throw new BadRequestException(
        `Couldn't fetch the agent certificate: ${(e as Error).message}`,
      );
    }
    await this.prisma.node.update({
      where: { id },
      data: { agentCertPem: captured.pem, agentCertSha256: captured.sha256 },
    });
    return { sha256: captured.sha256 };
  }

  /** Remove the pinned cert (revert to default transport for this node). */
  async unpinAgentCert(id: string): Promise<void> {
    await this.prisma.node.update({
      where: { id },
      data: { agentCertPem: null, agentCertSha256: null },
    });
  }

  /**
   * Ask the node's agent to restart itself in place. Game servers keep running
   * and are re-adopted when the agent comes back. Does NOT power-cycle the host.
   */
  async restartAgent(id: string): Promise<{ restarting: true }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    await this.agent.restartAgent(node);
    return { restarting: true };
  }

  /**
   * Wipe the node's cached steamcmd sessions (all per-account homes). Use after
   * changing/deauthorising a Steam game-download account so no stale session
   * lingers on the node. The next install re-authenticates the current account.
   */
  async clearSteamCache(id: string): Promise<{ cleared: true }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    await this.agent.clearSteamCache(node);
    return { cleared: true };
  }

  /**
   * Verify + cache the game-download Steam login on a node (pre-warms steamcmd,
   * then logs in on demand so a fresh Steam Guard code is used while still valid).
   * On success the node caches the machine-auth, so owned-game installs (Arma 3,
   * DayZ, …) need no further code. Credentials come from the caller (the admin
   * Steam settings); only the node lookup happens here.
   */
  async verifySteamLogin(
    id: string,
    creds: { username: string; password: string; guard?: string },
  ): Promise<{ ok: boolean; output: string }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    return this.agent.steamLogin(node, creds);
  }

  /**
   * Self-update the node agent to the latest published release (downloads the
   * prebuilt binary, verifies it, swaps it in and re-execs). Running game servers
   * keep running and re-attach — no SSH needed.
   */
  /** Read-only GitHub token for downloading private-repo release assets. */
  private githubToken(): string | undefined {
    return process.env.GITHUB_TOKEN?.trim() || undefined;
  }

  async updateAgent(id: string): Promise<{ updating: true }> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    await this.agent.updateAgent(node, this.githubToken());
    return { updating: true };
  }

  private agentVersionCache?: { value: string | null; at: number };
  private static readonly AGENT_VERSION_TTL = 15 * 60 * 1000; // 15 min

  /**
   * The latest published agent release tag (for the "update available" badge).
   * Cached ~15min; null when GitHub is unreachable/rate-limited (badge hides).
   */
  async latestAgentVersion(): Promise<string | null> {
    const now = Date.now();
    if (
      this.agentVersionCache &&
      now - this.agentVersionCache.at < NodesService.AGENT_VERSION_TTL
    ) {
      return this.agentVersionCache.value;
    }
    let value: string | null = null;
    try {
      const token = this.githubToken();
      const res = await fetch(
        "https://api.github.com/repos/refxfrank/refxhosting/releases/latest",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "ReFx-Panel",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: AbortSignal.timeout(6000),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { tag_name?: string };
        value = json.tag_name || null;
      }
    } catch {
      /* offline / rate-limited → leave null */
    }
    this.agentVersionCache = { value, at: now };
    return value;
  }

  /**
   * Self-update every (non-deleted) node's agent to the latest release. Best
   * effort: unreachable nodes are reported in `failed`, not thrown.
   */
  async updateAllAgents(ids?: string[]): Promise<{
    updated: string[];
    failed: { id: string; name: string; reason: string }[];
  }> {
    const nodes = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        ...(ids && ids.length ? { id: { in: ids } } : {}),
      },
    });
    const token = this.githubToken();
    const updated: string[] = [];
    const failed: { id: string; name: string; reason: string }[] = [];
    for (const node of nodes) {
      try {
        await this.agent.updateAgent(node, token);
        updated.push(node.id);
      } catch (e) {
        failed.push({
          id: node.id,
          name: node.name,
          reason: e instanceof Error ? e.message : "unreachable",
        });
      }
    }
    return { updated, failed };
  }

  async update(id: string, dto: UpdateNodeDto): Promise<Node> {
    if (
      dto.allocationPortStart != null &&
      dto.allocationPortEnd != null &&
      dto.allocationPortStart > dto.allocationPortEnd
    ) {
      throw new BadRequestException(
        "allocationPortStart must be <= allocationPortEnd",
      );
    }
    const data: UpdateNodeDto = { ...dto };
    if (data.fqdn !== undefined) data.fqdn = data.fqdn.trim();
    // Normalize/allow-clear the optional game domain (empty string -> null).
    const updateData =
      dto.gameDomain !== undefined
        ? { ...data, gameDomain: normalizeGameDomain(dto.gameDomain) }
        : data;
    try {
      return await this.prisma.node.update({ where: { id }, data: updateData });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new BadRequestException("Another node already uses that FQDN");
      }
      throw e;
    }
  }

  setMaintenance(id: string, on: boolean): Promise<Node> {
    return this.prisma.node.update({
      where: { id },
      data: { maintenance: on, state: on ? "MAINTENANCE" : "ONLINE" },
    });
  }

  /**
   * Push centrally-managed S3 backup credentials to every live node,
   * best-effort. Nodes that are offline pick the config up at their next
   * boot (the agent fetches /agent/backup-storage on start). Returns per-node
   * results so the admin UI can show exactly who got it.
   */
  async broadcastBackupStorage(
    s3: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      usePathStyle: boolean;
    } | null,
  ): Promise<{ nodeId: string; name: string; ok: boolean; error?: string }[]> {
    const nodes = await this.prisma.node.findMany({
      where: { deletedAt: null },
    });
    const results: {
      nodeId: string;
      name: string;
      ok: boolean;
      error?: string;
    }[] = [];
    for (const node of nodes) {
      try {
        await this.agent.pushBackupStorage(node, s3);
        results.push({ nodeId: node.id, name: node.name, ok: true });
      } catch (e) {
        results.push({
          nodeId: node.id,
          name: node.name,
          ok: false,
          error: (e as Error).message,
        });
      }
    }
    return results;
  }

  /**
   * Mark nodes OFFLINE when their agent has gone silent. Heartbeats flip a
   * node ONLINE but nothing used to flip it back, so a dead node kept its
   * ONLINE badge forever — and worse, stayed eligible for new-server
   * placement. Runs from NodesScheduler; recovery is automatic (the next
   * heartbeat marks the node ONLINE again). MAINTENANCE nodes keep their
   * state — the admin set it deliberately.
   */
  async sweepOfflineNodes(): Promise<number> {
    const cutoff = new Date(Date.now() - NODE_OFFLINE_AFTER_MS);
    const res = await this.prisma.node.updateMany({
      where: {
        state: "ONLINE",
        // The admin UI toggles the maintenance BOOLEAN (state often stays
        // ONLINE), and the heartbeat ONLINE-flip is gated on that boolean —
        // so the sweep must key on it too, or a maintenance node that
        // reboots gets stuck OFFLINE with no path back until maintenance
        // ends. Maintenance nodes keep whatever state they have.
        maintenance: false,
        deletedAt: null,
        heartbeats: { none: { recordedAt: { gte: cutoff } } },
        // A just-registered node is ONLINE with ZERO heartbeat rows (the
        // agent's first beat lands ~15s after registration), which matches
        // `none` vacuously — don't flip it during that window. Sweep only
        // nodes that have heartbeated before, or whose registration is
        // itself older than the window (registered but never reported).
        OR: [
          { heartbeats: { some: {} } },
          { bootstrapTokenUsedAt: { lt: cutoff } },
        ],
      },
      data: { state: "OFFLINE" },
    });
    if (res.count > 0) {
      this.logger.warn(
        `marked ${res.count} node(s) OFFLINE — no heartbeat for ${
          NODE_OFFLINE_AFTER_MS / 1000
        }s`,
      );
    }
    return res.count;
  }

  async delete(id: string): Promise<void> {
    const node = await this.prisma.node.findFirst({
      where: { id, deletedAt: null },
    });
    if (!node) throw new NotFoundException("Node not found");
    const servers = await this.prisma.server.count({
      where: { nodeId: id, deletedAt: null },
    });
    if (servers > 0) {
      throw new BadRequestException(
        "Cannot delete a node that still has servers; migrate them first",
      );
    }
    await this.prisma.node.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        state: "OFFLINE",
        // Release the globally-unique fqdn so a replacement node can reuse the
        // same address; the soft-deleted row is retained for history/FKs.
        fqdn: `${node.fqdn}#deleted-${Date.now()}`,
      },
    });
  }

  /**
   * Re-issue a bootstrap token for an existing node (rotation). Mints a fresh
   * single-use token with a new expiry window and clears the used marker so the
   * node can register again.
   */
  async regenerateBootstrap(
    id: string,
  ): Promise<{ bootstrapToken: string; expiresAt: Date }> {
    const bootstrapToken = this.crypto.token(32);
    const expiresAt = new Date(Date.now() + BOOTSTRAP_TOKEN_TTL_MS);
    await this.prisma.node.update({
      where: { id },
      data: {
        tokenHash: this.crypto.hash(bootstrapToken),
        bootstrapTokenExpiresAt: expiresAt,
        bootstrapTokenUsedAt: null,
      },
    });
    return { bootstrapToken, expiresAt };
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
      disk: {
        total: node.diskMb,
        used: usedDisk,
        free: node.diskMb - usedDisk,
      },
    };
  }

  /**
   * Portfolio economics: per-node monthly cost (what YOU pay) vs the ESTIMATED
   * monthly revenue of the servers placed on it, plus allocation and a
   * break-even fill point. Revenue is derived from the ACTIVE subscriptions of
   * servers on the node, each subscription's price normalized to monthly and
   * shared across its servers (a game-switch keeps identity, so usually 1:1).
   *
   * It is deliberately labelled an ESTIMATE: staff comps / free servers carry no
   * subscription, and per-slot (voice) plans price by slot, so it won't match
   * the books to the cent — but it's exact enough to flag an underwater node.
   */
  async economics() {
    const nodes = await this.prisma.node.findMany({
      where: { deletedAt: null },
      include: {
        region: { select: { code: true, name: true, country: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // One pass over active, server-bearing subscriptions; attribute each to the
    // node(s) its servers live on. Cheaper than N per-node queries.
    const subs = await this.prisma.subscription.findMany({
      where: { state: "ACTIVE", servers: { some: { deletedAt: null } } },
      select: {
        priceId: true,
        slots: true,
        servers: {
          where: { deletedAt: null },
          select: { nodeId: true },
        },
      },
    });
    const priceIds = [...new Set(subs.map((s) => s.priceId))];
    const prices = priceIds.length
      ? await this.prisma.price.findMany({
          where: { id: { in: priceIds } },
          select: {
            id: true,
            amountMinor: true,
            interval: true,
            currency: true,
          },
        })
      : [];
    const priceById = new Map(prices.map((p) => [p.id, p]));

    // nodeId -> { revenueMinor, paidServers }
    const revByNode = new Map<
      string,
      { revenueMinor: number; paidServers: number }
    >();
    for (const sub of subs) {
      const price = priceById.get(sub.priceId);
      if (!price || sub.servers.length === 0) continue;
      const monthly =
        toMonthlyMinor(price.amountMinor, price.interval) * (sub.slots || 1);
      const perServer = monthly / sub.servers.length;
      for (const srv of sub.servers) {
        const cur = revByNode.get(srv.nodeId) ?? {
          revenueMinor: 0,
          paidServers: 0,
        };
        cur.revenueMinor += perServer;
        cur.paidServers += 1;
        revByNode.set(srv.nodeId, cur);
      }
    }

    // Allocated resources per node (sum of provisioned server limits).
    const allocs = await this.prisma.server.groupBy({
      by: ["nodeId"],
      where: { deletedAt: null },
      _sum: { cpuCores: true, memoryMb: true, diskMb: true },
      _count: { _all: true },
    });
    const allocByNode = new Map(allocs.map((a) => [a.nodeId, a]));

    const rows = nodes.map((node) => {
      const alloc = allocByNode.get(node.id);
      const rev = revByNode.get(node.id) ?? { revenueMinor: 0, paidServers: 0 };
      const revenueMinor = Math.round(rev.revenueMinor);
      const costMinor = node.monthlyCostMinor ?? null;
      const marginMinor = costMinor != null ? revenueMinor - costMinor : null;
      const allocMemMb = alloc?._sum.memoryMb ?? 0;
      const allocMemGb = allocMemMb / 1024;
      // What you actually earn per GB of RAM allocated right now.
      const effectivePerGbMinor =
        allocMemGb > 0 ? revenueMinor / allocMemGb : null;
      // At that rate, how many GB you'd need allocated to cover the node's cost.
      const breakEvenMemGb =
        costMinor != null && effectivePerGbMinor && effectivePerGbMinor > 0
          ? costMinor / effectivePerGbMinor
          : null;

      return {
        id: node.id,
        name: node.name,
        provider: node.provider,
        region: node.region,
        monthlyCostMinor: costMinor,
        costCurrency: node.costCurrency,
        monthlyRevenueMinorEstimated: revenueMinor,
        marginMinor,
        profitable: costMinor != null ? revenueMinor >= costMinor : null,
        serverCount: alloc?._count._all ?? 0,
        paidServerCount: rev.paidServers,
        allocated: {
          cpuCores: alloc?._sum.cpuCores ?? 0,
          memoryMb: allocMemMb,
          diskMb: alloc?._sum.diskMb ?? 0,
        },
        capacity: {
          cpuCores: node.cpuCores * node.cpuOvercommit,
          memoryMb: node.memoryMb * node.memOvercommit,
          diskMb: node.diskMb,
        },
        effectivePerGbMinor:
          effectivePerGbMinor != null ? Math.round(effectivePerGbMinor) : null,
        breakEvenMemGb:
          breakEvenMemGb != null ? Math.round(breakEvenMemGb * 10) / 10 : null,
      };
    });

    // Portfolio totals. Cost only sums nodes that actually have a cost set.
    const nodesWithCost = rows.filter((r) => r.monthlyCostMinor != null);
    const totalCostMinor = nodesWithCost.reduce(
      (s, r) => s + (r.monthlyCostMinor ?? 0),
      0,
    );
    const totalRevenueMinor = rows.reduce(
      (s, r) => s + r.monthlyRevenueMinorEstimated,
      0,
    );

    return {
      currency: "USD",
      totals: {
        monthlyCostMinor: totalCostMinor,
        monthlyRevenueMinorEstimated: totalRevenueMinor,
        marginMinor: totalRevenueMinor - totalCostMinor,
        nodeCount: rows.length,
        nodesWithCost: nodesWithCost.length,
      },
      nodes: rows,
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
    requiresWeb = false,
  ): Promise<Node | null> {
    const candidates = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        state: "ONLINE",
        maintenance: false,
        ...(regionId ? { regionId } : {}),
        ...(requiresWeb ? { supportsWeb: true } : {}),
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
   * ONLINE, non-maintenance nodes IN a region with free capacity for `limits` —
   * powers the storefront node picker (only nodes an order can actually land on).
   */
  async nodesWithCapacity(
    regionId: string,
    limits: { cpuCores: number; memoryMb: number; diskMb: number },
    requiresWeb = false,
  ): Promise<Array<{ id: string; name: string }>> {
    const candidates = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        state: "ONLINE",
        maintenance: false,
        regionId,
        ...(requiresWeb ? { supportsWeb: true } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const out: Array<{ id: string; name: string }> = [];
    for (const n of candidates) {
      const cap = await this.capacity(n.id);
      if (
        cap.cpu.free >= limits.cpuCores &&
        cap.memory.free >= limits.memoryMb &&
        cap.disk.free >= limits.diskMb
      ) {
        out.push({ id: n.id, name: n.name });
      }
    }
    return out;
  }

  /**
   * Validate that a customer-chosen node can actually take this order: it exists,
   * is ONLINE and not in maintenance, is in the chosen region (when given), and
   * still has free capacity for the plan. Throws a clear error otherwise.
   */
  async assertEligibleForOrder(
    nodeId: string,
    limits: { cpuCores: number; memoryMb: number; diskMb: number },
    regionId?: string,
    requiresWeb = false,
  ): Promise<void> {
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId, deletedAt: null },
      select: {
        id: true,
        state: true,
        maintenance: true,
        regionId: true,
        supportsWeb: true,
      },
    });
    if (!node) throw new BadRequestException("Selected node is unavailable");
    if (node.state !== "ONLINE" || node.maintenance) {
      throw new BadRequestException(
        "Selected node is not accepting new servers",
      );
    }
    if (regionId && node.regionId !== regionId) {
      throw new BadRequestException(
        "Selected node is not in the chosen region",
      );
    }
    if (requiresWeb && !node.supportsWeb) {
      throw new BadRequestException(
        "Selected node does not host web servers — pick a web-enabled node.",
      );
    }
    const cap = await this.capacity(nodeId);
    if (
      cap.cpu.free < limits.cpuCores ||
      cap.memory.free < limits.memoryMb ||
      cap.disk.free < limits.diskMb
    ) {
      throw new BadRequestException(
        "Selected node no longer has capacity for this plan",
      );
    }
  }

  /**
   * Regions that currently have at least one ONLINE, non-maintenance node with
   * enough free capacity for `limits`. Powers the storefront location picker so
   * customers only see places their order can actually be provisioned.
   */
  async regionsWithCapacity(
    limits: {
      cpuCores: number;
      memoryMb: number;
      diskMb: number;
    },
    requiresWeb = false,
  ): Promise<
    Array<{ id: string; code: string; name: string; country: string }>
  > {
    const regions = await this.prisma.region.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, country: true },
    });
    const nodes = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        state: "ONLINE",
        maintenance: false,
        ...(requiresWeb ? { supportsWeb: true } : {}),
      },
      select: { id: true, regionId: true },
    });

    const out: Array<{
      id: string;
      code: string;
      name: string;
      country: string;
    }> = [];
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
    requiresWeb = false,
  ): Promise<string> {
    const candidates = await this.prisma.node.findMany({
      where: {
        deletedAt: null,
        ...(regionId ? { regionId } : {}),
        ...(requiresWeb ? { supportsWeb: true } : {}),
      },
    });
    const online = candidates.filter(
      (n) => n.state === "ONLINE" && !n.maintenance,
    );
    const needs = `Plan reserves ${limits.cpuCores} vCPU / ${limits.memoryMb} MB RAM / ${limits.diskMb} MB disk.`;
    const webNote = requiresWeb ? " web-enabled" : "";

    if (candidates.length === 0)
      return `${needs} No${webNote} nodes exist yet.`;
    if (online.length === 0) {
      return `${needs} No${webNote} nodes are ONLINE and out of maintenance.`;
    }

    // Report the most-free node so the operator can see the gap.
    let bestLine = "";
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
  async listHeartbeats(id: string, range = "1h"): Promise<unknown[]> {
    await this.get(id);
    const ms = this.rangeToMs(range);
    const since = new Date(Date.now() - ms);
    return this.prisma.nodeHeartbeat.findMany({
      where: { nodeId: id, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
      take: 5000,
    });
  }

  private rangeToMs(range: string): number {
    const map: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
    };
    return map[range] ?? map["1h"];
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
    if (!node) throw new BadRequestException("Invalid bootstrap token");

    // Single-use: a token that has already been redeemed is dead. The operator
    // must rotate it (admin "regenerate bootstrap token") to register again.
    if (node.bootstrapTokenUsedAt) {
      throw new BadRequestException("Bootstrap token already used");
    }
    // Time-boxed: reject an expired token. A null expiry (legacy rows created
    // before this field) is treated as non-expiring for backward compatibility.
    if (
      node.bootstrapTokenExpiresAt &&
      node.bootstrapTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException("Bootstrap token expired");
    }

    // Consume the token atomically: only flip it when it is STILL unused, so two
    // concurrent registrations with the same valid token cannot both win the
    // check-then-set race above. The DB enforces single-use; a loser sees 0 rows.
    const consumed = await this.prisma.node.updateMany({
      where: { id: node.id, bootstrapTokenUsedAt: null },
      data: {
        state: "ONLINE",
        agentVersion: dto.agentVersion ?? node.agentVersion,
        bootstrapTokenUsedAt: new Date(),
      },
    });
    if (consumed.count === 0) {
      throw new BadRequestException("Bootstrap token already used");
    }

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
      include: INSTALL_SPEC_INCLUDE,
    });
    return servers.map((server) => this.toServerInstallSpec(server));
  }

  /**
   * Build the wire-format ServerInstallSpec for ONE server. Used to push a spec
   * change (e.g. a new port allocation) to the agent via reloadServer without a
   * full reinstall.
   */
  async buildServerInstallSpec(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: INSTALL_SPEC_INCLUDE,
    });
    if (!server) throw new NotFoundException("Server not found");
    return this.toServerInstallSpec(server);
  }

  private toServerInstallSpec(server: ServerWithSpec) {
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

    // SERVER_MEMORY (-Xmx) is a read-only, system-managed variable: keep it in
    // lock-step with the server's actual RAM allocation instead of the frozen
    // template default, so plan upgrades actually raise the JVM heap. Only
    // override when the template declares it non-editable (ours to manage).
    const memVar = template?.variables?.find(
      (v) => v.envName === SERVER_MEMORY_VAR,
    );
    if (memVar && !memVar.userEditable && server.memoryMb > 0) {
      env[SERVER_MEMORY_VAR] = String(jvmHeapMb(server.memoryMb));
    }

    let sftpPassword = "";
    if (server.sftpPasswordEnc) {
      try {
        sftpPassword = this.crypto.decrypt(server.sftpPasswordEnc);
      } catch {
        sftpPassword = "";
      }
    }

    // Pick the JVM image for Minecraft servers. A customer JAVA_VERSION override
    // (the Java selector) wins; otherwise auto-select from the resolved
    // MINECRAFT_VERSION (handles servers created before this image, and "latest"
    // pins). The agent runs the install script in this image too, so install +
    // runtime share one compatible JVM. Non-Java images are untouched.
    let dockerImage = server.dockerImage ?? "";
    if (isJavaImage(dockerImage)) {
      const override = parseJavaOverride(env[JAVA_VERSION_VAR]);
      dockerImage = override
        ? javaImage(override, "jre")
        : (resolveJavaImage(dockerImage, env["MINECRAFT_VERSION"], "jre") ??
          dockerImage);
    }

    return {
      serverId: server.id,
      shortId: server.shortId,
      deployMethod: server.deployMethod,
      dockerImage,
      startupCommand: server.startupCommand ?? template?.startupCommand ?? "",
      startupDetect: template?.startupDetect ?? "",
      stopCommand: template?.stopCommand ?? "",
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
  }
}
