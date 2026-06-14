import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Registry,
} from 'prom-client';

/**
 * Central Prometheus registry + metric definitions for the panel-api.
 *
 * Default process/node metrics are collected automatically; on top of those we
 * expose a request counter (incremented by MetricsInterceptor) and a small set
 * of business gauges that a periodic refresh job can `set()` from the database.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  /** Content type to advertise on the /metrics endpoint. */
  readonly contentType = this.registry.contentType;

  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP (REST) requests handled, by method/route/status.',
    labelNames: ['method', 'route', 'status'] as const,
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

  onModuleInit(): void {
    // Register the standard Node.js / process collectors against our registry.
    collectDefaultMetrics({ register: this.registry });
    // TODO(impl): wire a cron to refresh gauges
    // (e.g. set serversTotal/nodesOnline/openTickets from periodic DB counts).
  }

  /** Increment the request counter for a completed REST request. */
  incHttp(method: string, route: string, status: number | string): void {
    this.httpRequestsTotal.inc({
      method: method.toUpperCase(),
      route,
      status: String(status),
    });
  }

  /** Bulk-set the business gauges (called by the refresh job). */
  setGauges(values: {
    serversTotal?: number;
    nodesOnline?: number;
    openTickets?: number;
  }): void {
    if (values.serversTotal !== undefined)
      this.serversTotal.set(values.serversTotal);
    if (values.nodesOnline !== undefined)
      this.nodesOnline.set(values.nodesOnline);
    if (values.openTickets !== undefined)
      this.openTickets.set(values.openTickets);
  }

  /** Render the full registry in Prometheus text exposition format. */
  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
