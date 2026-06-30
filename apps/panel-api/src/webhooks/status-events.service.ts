import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StatusService, StatusLevel } from '../status/status.service';
import { WebhooksService } from './webhooks.service';

/**
 * Detects PUBLIC component status transitions and pushes `component.status_changed`
 * webhooks. Component status is derived (not stored), so we recompute the public
 * status snapshot on a timer and diff it against the previous one — this catches
 * node-driven changes even when nobody is polling /status. Incident lifecycle
 * events are pushed directly from IncidentsService; this only covers components.
 */
@Injectable()
export class StatusEventsService {
  private readonly logger = new Logger(StatusEventsService.name);
  private previous: Map<string, StatusLevel> | null = null;

  constructor(
    private readonly status: StatusService,
    private readonly webhooks: WebhooksService,
  ) {}

  @Interval('status-component-watch', 30_000)
  async tick(): Promise<void> {
    let snapshot;
    try {
      snapshot = await this.status.getStatus();
    } catch (e) {
      this.logger.warn(`component watch skipped: ${String(e)}`);
      return;
    }

    const current = new Map<string, StatusLevel>(
      snapshot.components.map((c) => [c.key, c.status]),
    );

    // First run only seeds the baseline — never emits on startup.
    if (this.previous) {
      for (const c of snapshot.components) {
        const prev = this.previous.get(c.key);
        if (prev && prev !== c.status) {
          void this.webhooks
            .dispatch('component.status_changed', {
              key: c.key,
              name: c.name,
              status: c.status,
              previousStatus: prev,
              changedAt: snapshot.updatedAt,
            })
            .catch((e) =>
              this.logger.warn(`component webhook dispatch failed: ${String(e)}`),
            );
        }
      }
    }
    this.previous = current;
  }
}
