import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NodeAgentClient } from '../agent/agent.client';

/** Shape persisted by the TeamSpeak launcher (refx-voice.json) on the volume. */
interface VoiceCreds {
  queryAdmin?: string;
  queryPassword?: string;
  queryPort?: number;
  privilegeKey?: string;
  slots?: number;
}

export interface VoiceInfo {
  /** Voice connection address customers use in the TeamSpeak client. */
  address: string | null;
  voicePort: number | null;
  /** Purchased slot count (enforced as virtualserver_maxclients on the server). */
  slots: number | null;
  /** True once the server has booted and written its admin credentials. */
  ready: boolean;
  queryAdmin: string | null;
  queryPassword: string | null;
  queryPort: number;
  /** First-boot ServerQuery admin privilege key (single-use in the TS client). */
  privilegeKey: string | null;
  /** Whether the TeamSpeak license has been accepted (required to start). */
  licenseAccepted: boolean;
}

/** Server-env key recording the customer's TeamSpeak license acceptance. */
const LICENSE_ENV_KEY = 'REFX_TS3_LICENSE_ACCEPTED';

export interface VoiceChannel {
  id: string;
  name: string;
  /** Voice clients currently in this channel (clid for kick/ban targeting). */
  users: { clid: string; name: string }[];
  /** Per-channel client cap, or null when unlimited. */
  maxClients: number | null;
}

export interface VoiceBandwidthPoint {
  /** Unix epoch seconds. */
  t: number;
  /** Bytes/sec received (down) and sent (up). */
  down: number;
  up: number;
}

export interface VoiceBan {
  banid: string;
  name: string | null;
  ip: string | null;
  reason: string | null;
  /** 0 = permanent. */
  durationSeconds: number;
}

export interface VoiceAuditEntry {
  id: string;
  action: string;
  actor: string;
  at: string;
  detail: string | null;
}

export interface VoiceStatus {
  /** Live monitoring data is available and fresh (server up + recently polled). */
  ready: boolean;
  online: number;
  maxClients: number | null;
  channelCount: number;
  uptimeSeconds: number;
  serverName: string | null;
  /** Current bandwidth in bytes/sec (down = received, up = sent). */
  bandwidthDownBps: number;
  bandwidthUpBps: number;
  /** Average client ping in ms. */
  avgPingMs: number;
  /** Seconds since the snapshot was written (null when never). */
  updatedSecondsAgo: number | null;
  channels: VoiceChannel[];
  bans: VoiceBan[];
}

const STATUS_FILE = 'refx-voice-status.txt';
const CMD_FILE = 'refx-voice-cmd.txt';

/** TeamSpeak ServerQuery escaping → plain text. */
function unescapeTs3(v: string): string {
  return v
    .replace(/\\s/g, ' ')
    .replace(/\\p/g, '|')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\')
    .replace(/\\[abfnrtv]/g, ' ')
    .trim();
}

/** Plain text → TeamSpeak ServerQuery escaping (for outgoing command values). */
function escapeTs3(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/\//g, '\\/')
    .replace(/ /g, '\\s')
    .replace(/\|/g, '\\p')
    .replace(/[\r\n\t]/g, ' ');
}

/** Parse a TeamSpeak `key=value key2=value2` token group. */
function parsePairs(entry: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tok of entry.trim().split(/\s+/)) {
    if (!tok) continue;
    const i = tok.indexOf('=');
    if (i === -1) out[tok] = '';
    else out[tok.slice(0, i)] = unescapeTs3(tok.slice(i + 1));
  }
  return out;
}


@Injectable()
export class VoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  async info(serverId: string): Promise<VoiceInfo> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, template: true, allocations: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const slug = server.template?.slug ?? '';
    if (!slug.startsWith('teamspeak')) {
      throw new BadRequestException('This server is not a TeamSpeak voice server');
    }

    const primary =
      server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
    const address = primary ? `${primary.ip}:${primary.port}` : null;

    let creds: VoiceCreds | null = null;
    try {
      const res = await this.agent.readFile(server.node, serverId, 'refx-voice.json');
      // readFile returns the raw text for octet-stream responses; tolerate both.
      const raw =
        typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
      if (raw.trim()) creds = JSON.parse(raw) as VoiceCreds;
    } catch {
      creds = null; // not provisioned/booted yet, node unreachable, or no file
    }

    const env = (server.environment ?? {}) as Record<string, unknown>;
    const licenseAccepted = String(env[LICENSE_ENV_KEY] ?? '') === '1';

    return {
      address,
      voicePort: primary?.port ?? null,
      slots: server.slots ?? creds?.slots ?? null,
      ready: !!creds?.queryPassword,
      queryAdmin: creds?.queryAdmin ?? null,
      queryPassword: creds?.queryPassword ?? null,
      queryPort: creds?.queryPort ?? 10011,
      privilegeKey: creds?.privilegeKey ?? null,
      licenseAccepted,
    };
  }

  /**
   * Record the customer's acceptance of the TeamSpeak license on the server
   * (a panel-side flag the power gate checks before starting). Idempotent.
   */
  async acceptLicense(serverId: string): Promise<{ accepted: true }> {
    const server = await this.loadVoice(serverId);
    const environment = {
      ...((server.environment as Record<string, unknown>) ?? {}),
      [LICENSE_ENV_KEY]: '1',
    } as Prisma.InputJsonObject;
    await this.prisma.server.update({
      where: { id: serverId },
      data: { environment },
    });
    return { accepted: true };
  }

  /**
   * Live monitoring: active users, channels and server stats. The TS3 launcher
   * snapshots ServerQuery output to `refx-voice-status.txt` every ~15s (the
   * ServerQuery port isn't exposed off-node, so we read the file via the agent
   * rather than connecting directly). Data older than 90s — or a stopped server —
   * is reported as not ready.
   */
  async status(serverId: string): Promise<VoiceStatus> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, template: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (!(server.template?.slug ?? '').startsWith('teamspeak')) {
      throw new BadRequestException('This server is not a TeamSpeak voice server');
    }

    const empty: VoiceStatus = {
      ready: false,
      online: 0,
      maxClients: server.slots ?? null,
      channelCount: 0,
      uptimeSeconds: 0,
      serverName: null,
      bandwidthDownBps: 0,
      bandwidthUpBps: 0,
      avgPingMs: 0,
      updatedSecondsAgo: null,
      channels: [],
      bans: [],
    };
    if (server.state !== 'RUNNING') return empty;

    let text = '';
    try {
      const res = await this.agent.readFile(server.node, serverId, STATUS_FILE);
      text = typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
    } catch {
      return empty;
    }
    if (!text.trim()) return empty;

    let info: Record<string, string> = {};
    const clients: Record<string, string>[] = [];
    const channels: Record<string, string>[] = [];
    const bans: Record<string, string>[] = [];
    let snapshotEpoch = 0;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('refx_ts=')) {
        snapshotEpoch = Number(line.slice('refx_ts='.length)) || 0;
      } else if (line.includes('virtualserver_clientsonline=')) {
        info = parsePairs(line);
      } else if (/(^|\|)clid=/.test(line)) {
        for (const e of line.split('|')) {
          const p = parsePairs(e);
          if (p.clid) clients.push(p);
        }
      } else if (/(^|\|)banid=/.test(line)) {
        for (const e of line.split('|')) {
          const p = parsePairs(e);
          if (p.banid) bans.push(p);
        }
      } else if (line.includes('channel_name=')) {
        for (const e of line.split('|')) {
          const p = parsePairs(e);
          if (p.cid) channels.push(p);
        }
      }
    }

    // Real voice clients only (client_type 0; exclude ServerQuery clients).
    const voice = clients.filter((c) => c.client_type !== '1');
    const channelOut: VoiceChannel[] = channels.map((ch) => ({
      id: ch.cid,
      name: ch.channel_name ?? 'Channel',
      users: voice
        .filter((c) => c.cid === ch.cid && c.client_nickname)
        .map((c) => ({ clid: c.clid, name: c.client_nickname })),
      maxClients:
        ch.channel_flag_maxclients_unlimited === '0' && ch.channel_maxclients
          ? Number(ch.channel_maxclients) || null
          : null,
    }));

    const updatedSecondsAgo = snapshotEpoch
      ? Math.max(0, Math.floor(Date.now() / 1000) - snapshotEpoch)
      : null;
    const fresh = updatedSecondsAgo !== null && updatedSecondsAgo <= 90;

    return {
      ready: fresh,
      online: voice.length,
      maxClients: Number(info.virtualserver_maxclients) || server.slots || null,
      channelCount: channelOut.length,
      uptimeSeconds: Number(info.virtualserver_uptime) || 0,
      serverName: info.virtualserver_name ?? null,
      bandwidthDownBps:
        Number(info.connection_bandwidth_received_last_second_total) || 0,
      bandwidthUpBps: Number(info.connection_bandwidth_sent_last_second_total) || 0,
      avgPingMs: Math.round(Number(info.virtualserver_total_ping) || 0),
      updatedSecondsAgo,
      channels: channelOut,
      bans: bans.map((b) => ({
        banid: b.banid,
        name: b.lastnickname || b.name || null,
        ip: b.ip || null,
        reason: b.reason || null,
        durationSeconds: Number(b.duration) || 0,
      })),
    };
  }

  /**
   * Recent voice admin actions for this server (rename/kick/ban/move/unban),
   * newest first, from the audit log so customers can see what staff/sub-users
   * did. Read-only; details come from the recorded request metadata.
   */
  async auditLog(serverId: string): Promise<VoiceAuditEntry[]> {
    await this.loadVoice(serverId);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        targetType: 'Server',
        targetId: serverId,
        action: { startsWith: 'server.voice.' },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        actor: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map((r) => {
      const body = ((r.metadata as { body?: Record<string, unknown> })?.body ??
        {}) as Record<string, unknown>;
      const actor = r.actor
        ? `${r.actor.firstName ?? ''} ${r.actor.lastName ?? ''}`.trim() ||
          r.actor.email
        : 'System';
      let detail: string | null = null;
      if (r.action.endsWith('.rename') && body.name) detail = `→ ${String(body.name)}`;
      else if (body.label) detail = String(body.label);
      else if (body.reason) detail = String(body.reason);
      return {
        id: r.id,
        action: r.action.replace('server.voice.', ''),
        actor,
        at: r.createdAt.toISOString(),
        detail,
      };
    });
  }

  // ---- admin actions (queued to the launcher via a command file) ----------

  /** Load + validate a TeamSpeak server (with node) for an action. */
  private async loadVoice(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true, template: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    if (!(server.template?.slug ?? '').startsWith('teamspeak')) {
      throw new BadRequestException('This server is not a TeamSpeak voice server');
    }
    return server;
  }

  /**
   * Append a ServerQuery command line for the launcher to run. The launcher
   * processes (and clears) the file within a few seconds while running. We build
   * the commands ourselves with TS3 escaping — callers never pass raw lines.
   */
  private async queueCommand(
    server: { id: string; node: { id: string } & Record<string, unknown> },
    line: string,
  ): Promise<void> {
    let existing = '';
    try {
      const r = await this.agent.readFile(server.node as never, server.id, CMD_FILE);
      existing = typeof r === 'string' ? r : ((r as { content?: string })?.content ?? '');
    } catch {
      existing = '';
    }
    const next = `${existing.trim() ? existing.trim() + '\n' : ''}${line}\n`;
    await this.agent.writeFile(server.node as never, server.id, CMD_FILE, next);
  }

  /** Rename the virtual server (applies live, or on next start if stopped). */
  async rename(serverId: string, name: string): Promise<{ accepted: true }> {
    const clean = (name ?? '').trim();
    if (clean.length < 1 || clean.length > 64) {
      throw new BadRequestException('Server name must be 1–64 characters.');
    }
    const server = await this.loadVoice(serverId);
    await this.queueCommand(server, `serveredit virtualserver_name=${escapeTs3(clean)}`);
    return { accepted: true };
  }

  /** Kick a connected client (by clid from the monitoring list). */
  async kick(serverId: string, clid: string, reason?: string): Promise<{ accepted: true }> {
    if (!/^\d+$/.test(String(clid))) throw new BadRequestException('Invalid client id.');
    const server = await this.loadVoice(serverId);
    if (server.state !== 'RUNNING') {
      throw new BadRequestException('The server must be running to kick a user.');
    }
    const msg = escapeTs3((reason || 'Kicked by an admin').slice(0, 80));
    await this.queueCommand(server, `clientkick clid=${clid} reasonid=5 reasonmsg=${msg}`);
    return { accepted: true };
  }

  /** Ban a connected client. seconds=0 (default) is permanent. */
  async ban(
    serverId: string,
    clid: string,
    reason?: string,
    seconds?: number,
  ): Promise<{ accepted: true }> {
    if (!/^\d+$/.test(String(clid))) throw new BadRequestException('Invalid client id.');
    const server = await this.loadVoice(serverId);
    if (server.state !== 'RUNNING') {
      throw new BadRequestException('The server must be running to ban a user.');
    }
    const time = Math.max(0, Math.min(Number(seconds) || 0, 365 * 24 * 3600));
    const msg = escapeTs3((reason || 'Banned by an admin').slice(0, 80));
    await this.queueCommand(server, `banclient clid=${clid} time=${time} banreason=${msg}`);
    return { accepted: true };
  }

  /** Move a connected client into another channel. */
  async move(serverId: string, clid: string, cid: string): Promise<{ accepted: true }> {
    if (!/^\d+$/.test(String(clid)) || !/^\d+$/.test(String(cid))) {
      throw new BadRequestException('Invalid client or channel id.');
    }
    const server = await this.loadVoice(serverId);
    if (server.state !== 'RUNNING') {
      throw new BadRequestException('The server must be running to move a user.');
    }
    await this.queueCommand(server, `clientmove clid=${clid} cid=${cid}`);
    return { accepted: true };
  }

  /** Remove a ban by its banid (from the ban list). */
  async unban(serverId: string, banid: string): Promise<{ accepted: true }> {
    if (!/^\d+$/.test(String(banid))) throw new BadRequestException('Invalid ban id.');
    const server = await this.loadVoice(serverId);
    await this.queueCommand(server, `bandel banid=${banid}`);
    return { accepted: true };
  }

  /** Set a channel's client cap. max <= 0 / null removes the limit (unlimited). */
  async setChannelLimit(
    serverId: string,
    cid: string,
    max: number | null,
  ): Promise<{ accepted: true }> {
    if (!/^\d+$/.test(String(cid))) throw new BadRequestException('Invalid channel id.');
    const server = await this.loadVoice(serverId);
    if (server.state !== 'RUNNING') {
      throw new BadRequestException('The server must be running to change a channel.');
    }
    const n = Number(max) || 0;
    const cmd =
      n > 0
        ? `channeledit cid=${cid} channel_flag_maxclients_unlimited=0 channel_maxclients=${Math.min(
            n,
            10000,
          )}`
        : `channeledit cid=${cid} channel_flag_maxclients_unlimited=1 channel_maxclients=0`;
    await this.queueCommand(server, cmd);
    return { accepted: true };
  }

  /** Rolling bandwidth history (down/up bytes/sec) the launcher samples ~15s. */
  async bandwidthHistory(serverId: string): Promise<VoiceBandwidthPoint[]> {
    const server = await this.loadVoice(serverId);
    let text = '';
    try {
      const res = await this.agent.readFile(server.node, serverId, 'refx-voice-bw.csv');
      text = typeof res === 'string' ? res : ((res as { content?: string })?.content ?? '');
    } catch {
      return [];
    }
    const points: VoiceBandwidthPoint[] = [];
    for (const line of text.split('\n')) {
      const [t, down, up] = line.trim().split(',');
      const ts = Number(t);
      if (!ts) continue;
      points.push({ t: ts, down: Number(down) || 0, up: Number(up) || 0 });
    }
    return points;
  }
}
