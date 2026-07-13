import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { NodesService, NODE_OFFLINE_AFTER_MS } from "../nodes/nodes.service";

/**
 * Panel-side network monitoring. A cron sweep probes every node's agent on a
 * fixed cadence (reusing NodesService.ping, which returns a warm-connection
 * latency floor), and keeps a rolling per-node window of samples in Redis. From
 * that window we derive latency (current/avg/p95), jitter, probe-loss %, and
 * uptime %; throughput comes from the node's own heartbeat byte counters. This
 * measures the panel↔node control path — a real health signal without touching
 * the node agent. (Node-uplink packet loss would need agent-side probing.)
 */

const WINDOW = 120; // samples kept per node (~1h at 30s cadence)
const CADENCE_SEC = 30;
const PROBE_KEY = (id: string) => `net:probe:${id}`;
const MONITOR_ON = process.env.NETWORK_MONITOR !== "false";

interface Probe {
  t: number;
  ms: number | null; // latency of a successful probe, else null
  ok: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}

function stddev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

@Injectable()
export class NetworkService {
  private readonly logger = new Logger(NetworkService.name);
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly nodes: NodesService,
  ) {}

  /** Probe every node once per cadence; skip if a sweep is still running. */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async sweep(): Promise<void> {
    if (!MONITOR_ON || this.sweeping) return;
    this.sweeping = true;
    try {
      const nodes = await this.prisma.node.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      await Promise.all(nodes.map((n) => this.probe(n.id)));
    } catch (e) {
      this.logger.warn(`network sweep failed: ${(e as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async probe(nodeId: string): Promise<void> {
    let sample: Probe;
    try {
      const r = await this.nodes.ping(nodeId);
      sample = { t: Date.now(), ms: r.reachable ? r.ms : null, ok: r.reachable };
    } catch {
      sample = { t: Date.now(), ms: null, ok: false };
    }
    try {
      const key = PROBE_KEY(nodeId);
      await this.redis.client.lpush(key, JSON.stringify(sample));
      await this.redis.client.ltrim(key, 0, WINDOW - 1);
      // Self-clean the window a few hours after a node stops being probed
      // (e.g. deleted) so stale keys don't linger.
      await this.redis.client.expire(key, 6 * 3600);
    } catch {
      /* Redis blip — probe history is best-effort, never fail the sweep. */
    }
  }

  private async windowFor(nodeId: string): Promise<Probe[]> {
    try {
      const raw = await this.redis.client.lrange(PROBE_KEY(nodeId), 0, WINDOW - 1);
      // Stored newest-first (lpush); reverse to chronological for the sparkline.
      return raw.map((s) => JSON.parse(s) as Probe).reverse();
    } catch {
      return [];
    }
  }

  /** Per-node network health + a platform-wide rollup for the admin module. */
  async overview() {
    const nodes = await this.prisma.node.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        state: true,
        region: { select: { name: true } },
        heartbeats: { orderBy: { recordedAt: "desc" }, take: 2 },
      },
      orderBy: { name: "asc" },
    });

    const perNode = await Promise.all(
      nodes.map(async (n) => {
        const win = await this.windowFor(n.id);
        const oks = win
          .filter((s) => s.ok && s.ms != null)
          .map((s) => s.ms as number);
        const total = win.length;
        const failed = win.filter((s) => !s.ok).length;
        const lossPct = total ? Math.round((failed / total) * 100) : 0;
        const uptimePct = total
          ? Math.round(((total - failed) / total) * 100)
          : 100;
        const latencyMs = oks.length ? oks[oks.length - 1] : null;
        const avgMs = oks.length
          ? Math.round(oks.reduce((a, b) => a + b, 0) / oks.length)
          : null;
        const p95Ms = oks.length ? percentile([...oks].sort((a, b) => a - b), 95) : null;
        const jitterMs = oks.length > 1 ? Math.round(stddev(oks)) : 0;

        // Throughput (Mbps) from the delta of the two most recent heartbeat
        // byte counters. Counters are cumulative, so we need two points.
        let rxMbps = 0;
        let txMbps = 0;
        const [cur, prev] = n.heartbeats;
        if (cur && prev) {
          const dt =
            (new Date(cur.recordedAt).getTime() -
              new Date(prev.recordedAt).getTime()) /
            1000;
          if (dt > 0) {
            rxMbps = round1(
              (Math.max(0, Number(cur.netRxBytes - prev.netRxBytes)) * 8) /
                dt /
                1e6,
            );
            txMbps = round1(
              (Math.max(0, Number(cur.netTxBytes - prev.netTxBytes)) * 8) /
                dt /
                1e6,
            );
          }
        }
        const heartbeatAgeMs = cur
          ? Date.now() - new Date(cur.recordedAt).getTime()
          : null;

        // Health: down if the node is offline / silent; degraded on high loss
        // or p95 latency; else healthy.
        const isDown =
          n.state === "OFFLINE" ||
          (heartbeatAgeMs != null && heartbeatAgeMs > NODE_OFFLINE_AFTER_MS);
        const health = isDown
          ? "down"
          : lossPct >= 10 || (p95Ms != null && p95Ms >= 250)
            ? "degraded"
            : "healthy";

        return {
          nodeId: n.id,
          name: n.name,
          region: n.region?.name ?? "—",
          state: n.state,
          health,
          latencyMs,
          avgMs,
          p95Ms,
          jitterMs,
          lossPct,
          uptimePct,
          rxMbps,
          txMbps,
          heartbeatAgeMs,
          samples: total,
          latencyHistory: win.map((s) => s.ms), // null = failed probe
        };
      }),
    );

    const rollup = {
      nodes: perNode.length,
      healthy: perNode.filter((n) => n.health === "healthy").length,
      degraded: perNode.filter((n) => n.health === "degraded").length,
      down: perNode.filter((n) => n.health === "down").length,
      worstLossPct: perNode.reduce((m, n) => Math.max(m, n.lossPct), 0),
      worstP95Ms: perNode.reduce((m, n) => Math.max(m, n.p95Ms ?? 0), 0),
      totalRxMbps: round1(perNode.reduce((a, n) => a + n.rxMbps, 0)),
      totalTxMbps: round1(perNode.reduce((a, n) => a + n.txMbps, 0)),
    };

    return {
      monitor: MONITOR_ON,
      windowSamples: WINDOW,
      cadenceSec: CADENCE_SEC,
      rollup,
      nodes: perNode,
    };
  }
}
