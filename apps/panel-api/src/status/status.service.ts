import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/configuration';
import { IncidentsService } from '../platform/incidents.service';

export type StatusLevel = 'operational' | 'maintenance' | 'degraded' | 'outage';

export interface ComponentStatus {
  key: string;
  name: string;
  status: StatusLevel;
}
export interface RegionStatus {
  code: string;
  name: string;
  country: string;
  status: StatusLevel;
  nodesUp: number;
  nodesTotal: number;
  nodes: { name: string; status: StatusLevel }[];
}
export interface IncidentUpdateView {
  status: string;
  body: string;
  createdAt: string;
}
export interface IncidentView {
  id: string;
  title: string;
  status: string;
  impact: string;
  components: string[];
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdateView[];
}
export interface SystemStatus {
  status: StatusLevel;
  updatedAt: string;
  components: ComponentStatus[];
  regions: RegionStatus[];
  incidents: { active: IncidentView[]; recent: IncidentView[] };
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
    private readonly incidents: IncidentsService,
  ) {}

  async getStatus(): Promise<SystemStatus> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.value;

    const [nodes, webStatus, activeIncidents, publicIncidents] = await Promise.all([
      this.loadNodes(),
      this.checkWeb(),
      this.incidents.activeIncidents(),
      this.incidents.listPublic(),
    ]);

    // Worst active-incident impact per affected component key.
    const incidentLevel = new Map<string, StatusLevel>();
    for (const inc of activeIncidents) {
      const level = IncidentsService.impactLevel(inc.impact);
      for (const key of inc.components) {
        const prev = incidentLevel.get(key);
        if (!prev || SEVERITY[level] > SEVERITY[prev]) incidentLevel.set(key, level);
      }
    }

    // Group nodes by region.
    const byRegion = new Map<
      string,
      { name: string; country: string; nodes: { name: string; status: StatusLevel }[] }
    >();
    for (const n of nodes) {
      if (!n.region) continue;
      const fresh =
        n.heartbeats[0] != null &&
        now - new Date(n.heartbeats[0].recordedAt).getTime() < STALE_HEARTBEAT_MS;
      const nodeStatus = this.nodeStatus(n.state, n.maintenance, fresh);
      const entry =
        byRegion.get(n.region.code) ??
        { name: n.region.name, country: n.region.country, nodes: [] };
      entry.nodes.push({ name: n.name, status: nodeStatus });
      byRegion.set(n.region.code, entry);
    }

    const regions: RegionStatus[] = [...byRegion.entries()]
      .map(([code, { name, country, nodes: rNodes }]) => {
        const statuses = rNodes.map((n) => n.status);
        return {
          code,
          name,
          country,
          status: this.rollup(statuses),
          nodesUp: statuses.filter((s) => s === 'operational').length,
          nodesTotal: rNodes.length,
          nodes: rNodes.sort((a, b) => a.name.localeCompare(b.name)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const nodesStatus: StatusLevel = regions.length
      ? this.worst(regions.map((r) => r.status))
      : 'operational';

    // Auto-derived base status per component. iOS App has no server-side signal,
    // so it is operational unless an active incident says otherwise.
    const base: ComponentStatus[] = [
      // This code is serving the request, so the API itself is operational.
      { key: 'panel-api', name: 'Control Panel API', status: 'operational' },
      { key: 'web', name: 'Web Dashboard', status: webStatus },
      { key: 'nodes', name: 'Game Server Nodes', status: nodesStatus },
      { key: 'ios-app', name: 'iOS App', status: 'operational' },
    ];

    // Overlay active incidents: a component is at least as bad as any incident
    // declared against it.
    const components: ComponentStatus[] = base.map((c) => {
      const inc = incidentLevel.get(c.key);
      return inc ? { ...c, status: this.worst([c.status, inc]) } : c;
    });

    const value: SystemStatus = {
      status: this.worst(components.map((c) => c.status)),
      updatedAt: new Date(now).toISOString(),
      components,
      regions,
      incidents: {
        active: publicIncidents.active.map(toIncidentView),
        recent: publicIncidents.recent.map(toIncidentView),
      },
    };
    this.cache = { value, at: now };
    return value;
  }

  private loadNodes() {
    return this.prisma.node
      .findMany({
        where: { deletedAt: null },
        select: {
          name: true,
          state: true,
          maintenance: true,
          region: { select: { code: true, name: true, country: true } },
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

type IncidentRow = {
  id: string;
  title: string;
  status: string;
  impact: string;
  components: string[];
  startedAt: Date;
  resolvedAt: Date | null;
  updates: { status: string; body: string; createdAt: Date }[];
};

function toIncidentView(i: IncidentRow): IncidentView {
  return {
    id: i.id,
    title: i.title,
    status: i.status,
    impact: i.impact,
    components: i.components,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    updates: i.updates.map((u) => ({
      status: u.status,
      body: u.body,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}
