import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Central Prometheus registry + metric definitions for the panel-api.
 *
 * Metric names are kept in lock-step with the Grafana dashboard
 * (`infra/docker/grafana/provisioning/dashboards/refx-overview.json`):
 *   - `http_request_duration_seconds` (histogram, label `status_code`) backs the
 *     request-rate, latency p50/p95/p99 and 5xx-ratio panels.
 *   - `refx_servers{state=...}` backs the server-count-by-state panel.
 *   - `process_resident_memory_bytes` comes from collectDefaultMetrics.
 * A periodic refresh populates the business gauges from the database.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();

  /** Content type to advertise on the /metrics endpoint. */
  readonly contentType = this.registry.contentType;

  /** How often the business gauges are refreshed from the DB. */
  private readonly refreshMs = 15_000;
  private refreshTimer?: NodeJS.Timeout;

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP (REST) requests handled, by method/route/status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  /** Request latency histogram — drives the latency + rate + error panels. */
  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of handled HTTP (REST) requests in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  /** Provisioned game servers, partitioned by lifecycle state. */
  readonly servers = new Gauge({
    name: 'refx_servers',
    help: 'Number of provisioned game servers, labelled by state.',
    labelNames: ['state'] as const,
    registers: [this.registry],
  });

  readonly serversTotal = new Gauge({
    name: 'refx_servers_total',
    help: 'Total number of provisioned game servers.',
    registers: [this.registry],
  });

  readonly nodesOnline = new Gauge({
    name: 'refx_nodes_online',
    help: 'Number of nodes currently reporting an ONLINE state.',
    registers: [this.registry],
  });

  readonly openTickets = new Gauge({
    name: 'refx_open_tickets',
    help: 'Number of support tickets not in a RESOLVED/CLOSED state.',
    registers: [this.registry],
  });

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Register the standard Node.js / process collectors against our registry.
    collectDefaultMetrics({ register: this.registry });
    // Prime once, then refresh on an interval. Failures are non-fatal (the
    // endpoint must still serve request/default metrics even if the DB blips).
    void this.refreshGauges();
    this.refreshTimer = setInterval(() => {
      void this.refreshGauges();
    }, this.refreshMs);
    // Don't keep the event loop alive on shutdown.
    this.refreshTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  /** Record a completed REST request (counter + latency histogram). */
  recordHttp(
    method: string,
    route: string,
    statusCode: number | string,
    durationSeconds: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode),
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, durationSeconds);
  }

  /** Populate the business gauges from current database counts. */
  async refreshGauges(): Promise<void> {
    try {
      const [byState, nodesOnline, openTickets] = await Promise.all([
        this.prisma.server.groupBy({
          by: ['state'],
          _count: { _all: true },
          where: { deletedAt: null },
        }),
        this.prisma.node.count({
          where: { state: 'ONLINE', deletedAt: null },
        }),
        this.prisma.ticket.count({
          where: { state: { notIn: ['RESOLVED', 'CLOSED'] } },
        }),
      ]);

      this.servers.reset();
      let total = 0;
      for (const row of byState) {
        const n = row._count._all;
        this.servers.set({ state: row.state }, n);
        total += n;
      }
      this.serversTotal.set(total);
      this.nodesOnline.set(nodesOnline);
      this.openTickets.set(openTickets);
    } catch (err) {
      this.logger.warn(
        `metrics gauge refresh failed: ${(err as Error).message}`,
      );
    }
  }

  /** Render the full registry in Prometheus text exposition format. */
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
