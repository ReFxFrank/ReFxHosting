import { Injectable, NotFoundException } from '@nestjs/common';
import { Node, Server, ServerStat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LiveStats, NodeAgentClient } from '../agent/agent.client';

/** Supported history ranges -> lookback window in milliseconds. */
const RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
  ) {}

  private async serverWithNode(
    serverId: string,
  ): Promise<Server & { node: Node }> {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { node: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return server;
  }

  /** Live snapshot straight from the node-agent. */
  async current(serverId: string): Promise<LiveStats> {
    const server = await this.serverWithNode(serverId);
    return this.agent.fetchStats(server.node, serverId);
  }

  /** Historical samples from persisted ServerStat rows. */
  async history(serverId: string, range = '1h'): Promise<ServerStat[]> {
    await this.serverWithNode(serverId);
    const windowMs = RANGE_MS[range] ?? RANGE_MS['1h'];
    const since = new Date(Date.now() - windowMs);
    return this.prisma.serverStat.findMany({
      where: { serverId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
