import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { pingMinecraft } from "./minecraft-ping.util";

/**
 * Live player list/counter for Minecraft servers, via Server List Ping
 * against the server's public game port — the exact status the vanilla
 * multiplayer screen shows, so it works on every loader with zero server
 * config and zero agent involvement. Non-Minecraft templates report
 * `supported: false` (the UI hides the module).
 */

export interface PlayersResult {
  supported: boolean;
  /** Whether the ping succeeded (server up AND accepting connections). */
  online: boolean;
  players?: { online: number; max: number; names: string[] };
  version?: string | null;
  latencyMs?: number;
}

/** Serve cached results for this long — protects game servers from being
 *  ping-hammered when several staff/sub-users keep consoles open. */
const PLAYERS_CACHE_MS = 10_000;
const PING_TIMEOUT_MS = 3_000;

@Injectable()
export class PlayersService {
  private readonly cache = new Map<string, { at: number; data: PlayersResult }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(serverId: string): Promise<PlayersResult> {
    const hit = this.cache.get(serverId);
    if (hit && Date.now() - hit.at < PLAYERS_CACHE_MS) return hit.data;

    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      select: {
        state: true,
        environment: true,
        template: { select: { slug: true } },
        allocations: true,
        node: { select: { fqdn: true } },
      },
    });
    if (!server) throw new NotFoundException("Server not found");

    const env = (server.environment ?? {}) as Record<string, unknown>;
    const isMinecraft =
      (server.template?.slug ?? "").startsWith("minecraft") ||
      env.MINECRAFT_VERSION != null;
    if (!isMinecraft) {
      return this.remember(serverId, { supported: false, online: false });
    }
    if (server.state !== "RUNNING") {
      return this.remember(serverId, { supported: true, online: false });
    }
    const primary =
      server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
    if (!primary) {
      return this.remember(serverId, { supported: true, online: false });
    }

    try {
      const status = await pingMinecraft(
        primary.ip || server.node.fqdn,
        primary.port,
        PING_TIMEOUT_MS,
      );
      return this.remember(serverId, {
        supported: true,
        online: true,
        players: {
          online: status.online,
          max: status.max,
          names: status.names,
        },
        version: status.version,
        latencyMs: status.latencyMs,
      });
    } catch {
      // Starting up, ping blocked, or mid-restart: report "no data" rather
      // than erroring the console page.
      return this.remember(serverId, { supported: true, online: false });
    }
  }

  private remember(serverId: string, data: PlayersResult): PlayersResult {
    this.cache.set(serverId, { at: Date.now(), data });
    return data;
  }
}
