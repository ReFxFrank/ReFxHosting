import {
  Body,
  Controller,
  Get,
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
import { WebhookService } from '../webhooks/webhook.service';
import { ConsoleGateway } from './console.gateway';
import { AgentSignatureGuard } from './agent-signature.guard';
import { uuidv7 } from '../common/util/uuid';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly nodes: NodesService,
    private readonly console: ConsoleGateway,
    private readonly webhooks: WebhookService,
  ) {}

  /**
   * Apply a server state from an agent callback, emitting `server.state.changed`
   * only on an actual transition. Mirrors the existing best-effort semantics
   * (DB-update errors are swallowed; the webhook emit only enqueues).
   */
  private async applyServerState(
    serverId: string,
    state: ServerState,
  ): Promise<void> {
    const updated = await this.prisma.server
      .updateMany({ where: { id: serverId, state: { not: state } }, data: { state } })
      .catch(() => ({ count: 0 }));
    if (updated.count > 0) {
      await this.webhooks.emit('server.state.changed', { serverId, state });
    }
  }

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
    await this.prisma.nodeHeartbeat.create({
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
    });
    // Marks ONLINE + emits node.state.changed only on an actual transition.
    await this.nodes.markNodeOnline(nodeId, body.agentVersion);
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('stats')
  async stats(
    @Body() body: { stats?: StatSample[] },
  ): Promise<{ ok: true }> {
    const samples = body.stats ?? [];
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
      if (state) {
        await this.applyServerState(s.serverId, state);
      }
    }
    return { ok: true };
  }

  @Public()
  @UseGuards(AgentSignatureGuard)
  @Post('logs')
  logs(@Body() body: { lines?: LogLine[] }): { ok: true } {
    for (const line of body.lines ?? []) {
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
  async powerEvent(@Body() body: PowerEventBody): Promise<{ ok: true }> {
    const state = this.toServerState(body.state);
    if (state) {
      await this.applyServerState(body.serverId, state);
    }
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
    @Body() body: BackupProgressBody,
  ): Promise<{ ok: true }> {
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
