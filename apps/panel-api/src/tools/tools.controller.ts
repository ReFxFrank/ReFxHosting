import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../common/decorators/public.decorator";
import { MinecraftPingService } from "./minecraft-ping.service";

/**
 * Public, unauthenticated utilities backing the marketing site's /tools
 * pages. Everything here is strictly rate-limited and SSRF-guarded — these
 * endpoints exist to earn organic traffic, not to be an open proxy.
 */
@Controller("tools")
export class ToolsController {
  constructor(private readonly mcPing: MinecraftPingService) {}

  /** Live Java-edition server status (the /tools/minecraft-server-status page). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get("minecraft-status")
  async minecraftStatus(
    @Query("host") host?: string,
    @Query("port") port?: string,
  ) {
    if (!host || host.length > 253) {
      return { online: false, host: host ?? "", port: 25565, reason: "Invalid host or port" };
    }
    const parsedPort = port !== undefined && port !== "" ? Number(port) : undefined;
    if (parsedPort !== undefined && !Number.isInteger(parsedPort)) {
      return { online: false, host, port: 0, reason: "Invalid host or port" };
    }
    return this.mcPing.status(host, parsedPort);
  }
}
