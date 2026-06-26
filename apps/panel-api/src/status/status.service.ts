import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';

export type StatusLevel = 'operational' | 'maintenance' | 'degraded' | 'outage';

export interface ComponentStatus {
  key: string;
  name: string;
  status: StatusLevel;
}
export interface RegionStatus {
  code: string;
  name: string;
  status: StatusLevel;
}
export interface SystemStatus {
  status: StatusLevel;
  updatedAt: string;
  components: ComponentStatus[];
  regions: RegionStatus[];
}

/** A node heartbeat older than this counts as stale (node not reporting). */
const STALE_HEARTBEAT_MS = 3 * 60 * 1000;
/** Public status is cached briefly so the endpoint can't hammer the DB. */
const CACHE_TTL_MS = 15 * 1000;
/** Web-health ping timeout — keep the status endpoint snappy. */
const WEB_PING_TIMEOUT_MS = 2500;

const SEVERITY: Record<StatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  outage: 3,
};

/**
 * Aggregated, PUBLIC-SAFE platform status derived from node health. Exposes only
 * region-level rollups — never fqdns, IPs, tokens, or per-node detail.
 */
@Injectable()
export class StatusService {
  private cache: { value: SystemStatus; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getStatus(): Promise<SystemStatus> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const [nodes, webStatus] = await Promise.all([this.loadNodes(), this.checkWeb()]);

    // Group node statuses by region.
    const byRegion = new Map<string, { name: string; statuses: StatusLevel[] }>();
    for (const n of nodes) {
      if (!n.region) continue;
      const fresh =
        n.heartbeats[0] != null &&
        now - new Date(n.heartbeats[0].recordedAt).getTime() < STALE_HEARTBEAT_MS;
      const nodeStatus = this.nodeStatus(n.state, n.maintenance, fresh);
      const entry = byRegion.get(n.region.code) ?? { name: n.region.name, statuses: [] };
      entry.statuses.push(nodeStatus);
      byRegion.set(n.region.code, entry);
    }

    const regions: RegionStatus[] = [...byRegion.entries()]
      .map(([code, { name, statuses }]) => ({ code, name, status: this.rollup(statuses) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const nodesStatus: StatusLevel = regions.length
      ? this.worst(regions.map((r) => r.status))
      : 'operational';

    const components: ComponentStatus[] = [
      // This code is serving the request, so the API itself is operational.
      { key: 'panel-api', name: 'Control Panel API', status: 'operational' },
      { key: 'web', name: 'Web Dashboard', status: webStatus },
      { key: 'nodes', name: 'Game Server Nodes', status: nodesStatus },
    ];

    const value: SystemStatus = {
      status: this.worst(components.map((c) => c.status)),
      updatedAt: new Date(now).toISOString(),
      components,
      regions,
    };
    this.cache = { value, at: now };
    return value;
  }

  private loadNodes() {
    return this.prisma.node
      .findMany({
        where: { deletedAt: null },
        select: {
          state: true,
          maintenance: true,
          region: { select: { code: true, name: true } },
          heartbeats: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
            select: { recordedAt: true },
          },
        },
      })
      .catch(() => []);
  }

  /** Ping the web container's health route; unreachable/non-200 = outage. */
  private async checkWeb(): Promise<StatusLevel> {
    const url = this.config.get<AppConfig['web']>('web')?.healthUrl;
    if (!url) return 'operational';
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(WEB_PING_TIMEOUT_MS),
      });
      return res.ok ? 'operational' : 'outage';
    } catch {
      return 'outage';
    }
  }

  private nodeStatus(state: string, maintenance: boolean, fresh: boolean): StatusLevel {
    if (maintenance || state === 'MAINTENANCE' || state === 'PROVISIONING') return 'maintenance';
    if (state === 'OFFLINE') return 'outage';
    if (state === 'DEGRADED') return 'degraded';
    if (state === 'ONLINE') return fresh ? 'operational' : 'degraded';
    return 'degraded';
  }

  /** Reduce a region's node statuses to one label (partial failure = degraded). */
  private rollup(statuses: StatusLevel[]): StatusLevel {
    if (!statuses.length) return 'operational';
    const allSame = (s: StatusLevel) => statuses.every((x) => x === s);
    if (allSame('operational')) return 'operational';
    if (allSame('maintenance')) return 'maintenance';
    if (allSame('outage')) return 'outage';
    return 'degraded';
  }

  private worst(statuses: StatusLevel[]): StatusLevel {
    return statuses.reduce<StatusLevel>(
      (acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc),
      'operational',
    );
  }
}
