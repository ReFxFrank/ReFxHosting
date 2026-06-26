import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import {
  BackupState,
  Prisma,
  ServerState,
} from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { NodesService } from '../nodes/nodes.service';
import { NotificationsService } from '../platform/notifications.service';
import { PushService } from '../push/push.service';
import { ConsoleGateway } from './console.gateway';
import { AgentSignatureGuard } from './agent-signature.guard';
import { uuidv7 } from '../common/util/uuid';

/**
 * Server-state transitions worth notifying the owner about. Deliberately limited
 * to involuntary / important events (crash, suspension) — routine start/stop the
 * owner performs themselves would just be noise (and would re-appear every time
 * they cycle the server).
 */
const SERVER_STATE_NOTICES: Partial<Record<ServerState, string>> = {
  [ServerState.CRASHED]: 'has crashed',
  [ServerState.SUSPENDED]: 'was suspended',
};

/**
 * Server transitions worth a mobile PUSH to the owner. Broader than the in-app
 * notices above (includes routine online/offline) because the iOS app surfaces
 * these as live status — but throttled per-server+state so a flapping server
 * can't spam the lock screen.
 */
const SERVER_STATE_PUSH: Partial<Record<ServerState, string>> = {
  [ServerState.RUNNING]: 'is now online',
  [ServerState.OFFLINE]: 'is now offline',
  [ServerState.CRASHED]: 'has crashed',
};

// Don't re-notify the same server entering the same state more than once within
// this window — stops a flapping/crash-looping server from re-stacking the same
// alert (which reads as a cleared notification "coming back").
const STATE_NOTICE_THROTTLE_MS = 30 * 60 * 1000; // 30 min
// Above this many tracked servers, sweep entries past the throttle window.
const STATE_NOTICE_MAX_ENTRIES = 1000;

/** Body shapes the node-agent posts back to the panel. */
interface RegisterBody {
  bootstrapToken: string;
  agentVersion?: string;
  capabilities?: unknown;
}

interface HeartbeatBody {
  nodeId?: string;
  cpuPct: number;
  memUsedMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  containers: number;
  agentVersion?: string;
}

interface StatSample {
  serverId: string;
  cpuPct: number;
  memUsedMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  state?: string;
  players?: number | null;
}

interface LogLine {
  serverId: string;
  line: string;
  stream?: string;
  at?: number;
}

interface PowerEventBody {
  serverId: string;
  state: string;
}

interface BackupProgressBody {
  serverId: string;
  backupId: string;
  status: string;
  progress?: number;
  message?: string;
  location?: string;
  sizeBytes?: number;
  checksum?: string;
  error?: string;
}

type ReqWithNode = Request & { refxNodeId?: string };

/**
 * Inbound callbacks the node-agent calls on the panel. All routes live under
 * `/api/v1/agent/*` and are @Public() (no user JWT). `register` is token-only;
 * every other route is HMAC-signed and verified by AgentSignatureGuard, which
 * resolves the node from the `X-Refx-Node` header and stashes it on the request.
 */
@ApiTags('agent-callbacks')
@SkipThrottle()
// The agent parses bare JSON (e.g. { nodeId, signingKey, servers }); bypass the
// global { success, data } envelope for the whole agent callback surface.
@RawResponse()
@Controller('agent')
export class AgentCallbacksController {
  // Per-server throttle for owner state-change notifications (in-memory; resets
  // on panel restart, which is fine — it only suppresses near-duplicate alerts).
  private readonly logger = new Logger(AgentCallbacksController.name);
  private readonly recentStateNotices = new Map<
    string,
    { state: ServerState; at: number }
  >();
  // Separate throttle map for mobile pushes (different state set than in-app
  // notices, so it can't share recentStateNotices without cross-suppressing).
  private readonly recentStatePushes = new Map<
    string,
    { state: ServerState; at: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly nodes: NodesService,
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
    private readonly console: ConsoleGateway,
  ) {}

  // ---- registration (token-only, unsigned) --------------------------------

  @Public()
  @Post('register')
  register(@Body() body: RegisterBody) {
    return this.nodes.registerAgentByToken({
      bootstrapToken: body.bootstrapToken,
      agentVersion: body.agentVersion,
      capabilities: body.capabilities,
    });
  }

  // ---- signed: reload this node's assigned servers on (re)boot ------------

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Get('servers')
  listServers(@Req() req: ReqWithNode) {
    // The agent calls this on every boot so its runtime Manager + SFTP creds
    // survive restarts (it only receives `servers` in the register response on
    // first boot). Same ServerInstallSpec shape as register.
    return this.nodes.buildServerInstallSpecs(req.refxNodeId!);
  }

  // ---- signed telemetry ---------------------------------------------------

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('heartbeat')
  async heartbeat(
    @Req() req: ReqWithNode,
    @Body() body: HeartbeatBody,
  ): Promise<{ ok: true }> {
    const nodeId = req.refxNodeId!;
    await this.prisma.$transaction([
      this.prisma.nodeHeartbeat.create({
        data: {
          id: uuidv7(),
          nodeId,
          cpuPct: body.cpuPct ?? 0,
          memUsedMb: Math.round(body.memUsedMb ?? 0),
          diskUsedMb: Math.round(body.diskUsedMb ?? 0),
          netRxBytes: BigInt(Math.round(body.netRxBytes ?? 0)),
          netTxBytes: BigInt(Math.round(body.netTxBytes ?? 0)),
          containers: body.containers ?? 0,
        },
      }),
      this.prisma.node.update({
        where: { id: nodeId },
        data: {
          state: 'ONLINE',
          agentVersion: body.agentVersion ?? undefined,
        },
      }),
    ]);
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('stats')
  async stats(
    @Req() req: ReqWithNode,
    @Body() body: { stats?: StatSample[] },
  ): Promise<{ ok: true }> {
    const all = body.stats ?? [];
    if (all.length === 0) return { ok: true };

    // A node is only authenticated as ITSELF; drop any samples for servers that
    // don't belong to it so one node can't write another node's telemetry/state.
    const owned = await this.ownedServerIds(req.refxNodeId!, all.map((s) => s.serverId));
    const samples = all.filter((s) => owned.has(s.serverId));
    if (samples.length === 0) return { ok: true };

    await this.prisma.serverStat.createMany({
      data: samples.map((s) => ({
        id: uuidv7(),
        serverId: s.serverId,
        cpuPct: s.cpuPct ?? 0,
        memUsedMb: Math.round(s.memUsedMb ?? 0),
        diskUsedMb: Math.round(s.diskUsedMb ?? 0),
        netRxBytes: BigInt(Math.round(s.netRxBytes ?? 0)),
        netTxBytes: BigInt(Math.round(s.netTxBytes ?? 0)),
        players: s.players ?? null,
      })),
      skipDuplicates: true,
    });

    for (const s of samples) {
      this.console.emitStats(s.serverId, s);
      const state = this.toServerState(s.state);
      if (state) await this.applyServerState(s.serverId, state);
    }
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('logs')
  async logs(
    @Req() req: ReqWithNode,
    @Body() body: { lines?: LogLine[] },
  ): Promise<{ ok: true }> {
    const lines = body.lines ?? [];
    // Only relay console lines for servers that belong to the calling node, so a
    // node can't inject output into another tenant's console stream.
    const owned = await this.ownedServerIds(req.refxNodeId!, lines.map((l) => l.serverId));
    for (const line of lines) {
      if (!owned.has(line.serverId)) continue;
      this.console.emitConsole(line.serverId, {
        type: 'console',
        line: line.line,
        stream: line.stream ?? 'stdout',
        at: line.at,
      });
    }
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('power-event')
  async powerEvent(
    @Req() req: ReqWithNode,
    @Body() body: PowerEventBody,
  ): Promise<{ ok: true }> {
    // Reject power events for servers that aren't on the calling node.
    const owned = await this.ownedServerIds(req.refxNodeId!, [body.serverId]);
    if (!owned.has(body.serverId)) return { ok: true };
    const state = this.toServerState(body.state);
    if (state) await this.applyServerState(body.serverId, state);
    this.console.emitPower(body.serverId, {
      type: 'power',
      state: body.state,
    });
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('backup-progress')
  async backupProgress(
    @Req() req: ReqWithNode,
    @Body() body: BackupProgressBody,
  ): Promise<{ ok: true }> {
    // Only let a node update backups whose server lives on that node.
    const backup = await this.prisma.backup
      .findUnique({
        where: { id: body.backupId },
        select: { server: { select: { nodeId: true } } },
      })
      .catch(() => null);
    if (!backup || backup.server.nodeId !== req.refxNodeId) return { ok: true };

    const data: Prisma.BackupUpdateInput = {};
    const state = this.toBackupState(body.status);
    if (state) data.state = state;
    if (body.location != null) data.location = body.location;
    if (body.sizeBytes != null) data.sizeBytes = BigInt(Math.round(body.sizeBytes));
    if (body.checksum != null) data.checksum = body.checksum;
    if (body.error != null) data.error = body.error;
    if (state === BackupState.COMPLETED) data.completedAt = new Date();

    if (Object.keys(data).length > 0) {
      await this.prisma.backup
        .update({ where: { id: body.backupId }, data })
        .catch(() => undefined);
    }
    return { ok: true };
  }

  // ---- mapping helpers ----------------------------------------------------

  /** Of the given serverIds, those that actually belong to `nodeId`. */
  private async ownedServerIds(
    nodeId: string,
    serverIds: string[],
  ): Promise<Set<string>> {
    const ids = [...new Set(serverIds.filter(Boolean))];
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.server.findMany({
      where: { id: { in: ids }, nodeId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Persist a server's state; on a notable transition (online / offline /
   * crashed / suspended) notify the owner. Unchanged state or a missing server
   * is a no-op. Best-effort — agent callbacks must not fail on notify errors.
   */
  private async applyServerState(
    serverId: string,
    state: ServerState,
  ): Promise<void> {
    const server = await this.prisma.server
      .findUnique({
        where: { id: serverId },
        select: { ownerId: true, name: true, state: true },
      })
      .catch(() => null);
    if (!server || server.state === state) {
      this.logger.debug(
        `[push-trace] state ${serverId} -> ${state}: ${
          !server ? 'no server' : 'unchanged'
        } (no push)`,
      );
      return;
    }
    this.logger.debug(
      `[push-trace] state ${serverId} ${server.state} -> ${state} owner=${server.ownerId}`,
    );

    await this.prisma.server
      .update({ where: { id: serverId }, data: { state } })
      .catch(() => undefined);

    const phrase = SERVER_STATE_NOTICES[state];
    if (phrase) {
      const last = this.recentStateNotices.get(serverId);
      const now = Date.now();
      const throttled =
        last && last.state === state && now - last.at < STATE_NOTICE_THROTTLE_MS;
      if (!throttled) {
        this.recentStateNotices.set(serverId, { state, at: now });
        // Bound the map: drop entries past the throttle window (they no longer
        // suppress anything) so it can't grow without limit on a large fleet.
        if (this.recentStateNotices.size > STATE_NOTICE_MAX_ENTRIES) {
          for (const [sid, v] of this.recentStateNotices) {
            if (now - v.at >= STATE_NOTICE_THROTTLE_MS) {
              this.recentStateNotices.delete(sid);
            }
          }
        }
        await this.notifications
          .createNotification(server.ownerId, {
            title: 'Server status changed',
            body: `Your server "${server.name}" ${phrase}.`,
          })
          .catch(() => undefined);
      }
    }

    // Mobile push (online/offline/crashed), throttled independently. Best-effort.
    const pushPhrase = SERVER_STATE_PUSH[state];
    if (!pushPhrase) {
      this.logger.debug(`[push-trace] ${serverId} -> ${state}: not a push-worthy state, skip`);
      return;
    }
    if (this.pushThrottled(serverId, state)) {
      this.logger.debug(
        `[push-trace] ${serverId} -> ${state}: THROTTLED (same state within 30min), skip`,
      );
      return;
    }
    this.logger.debug(
      `[push-trace] ${serverId} -> ${state}: sending push to owner=${server.ownerId}`,
    );
    await this.push
      .sendToUser(server.ownerId, {
        title: 'Server status changed',
        body: `${server.name} ${pushPhrase}.`,
        type: 'server.state',
        data: { serverId },
      })
      .catch((e) => this.logger.warn(`[push-trace] sendToUser threw: ${String(e)}`));
  }

  /**
   * True if a push for this server+state was already sent inside the throttle
   * window; otherwise records this send and returns false. Bounds the map by
   * sweeping expired entries when it grows large.
   */
  private pushThrottled(serverId: string, state: ServerState): boolean {
    const now = Date.now();
    const last = this.recentStatePushes.get(serverId);
    if (last && last.state === state && now - last.at < STATE_NOTICE_THROTTLE_MS) {
      return true;
    }
    this.recentStatePushes.set(serverId, { state, at: now });
    if (this.recentStatePushes.size > STATE_NOTICE_MAX_ENTRIES) {
      for (const [sid, v] of this.recentStatePushes) {
        if (now - v.at >= STATE_NOTICE_THROTTLE_MS) this.recentStatePushes.delete(sid);
      }
    }
    return false;
  }

  /** Map an agent state string onto the Prisma ServerState enum, if valid. */
  private toServerState(state?: string): ServerState | undefined {
    if (!state) return undefined;
    const upper = state.toUpperCase();
    return (Object.values(ServerState) as string[]).includes(upper)
      ? (upper as ServerState)
      : undefined;
  }

  /** Map an agent backup status string onto the Prisma BackupState enum. */
  private toBackupState(status?: string): BackupState | undefined {
    switch (status) {
      case 'running':
        return BackupState.IN_PROGRESS;
      case 'completed':
        return BackupState.COMPLETED;
      case 'failed':
        return BackupState.FAILED;
      default:
        // restore_failed / restored / restore progress: no backup-state change.
        return undefined;
    }
  }
}
