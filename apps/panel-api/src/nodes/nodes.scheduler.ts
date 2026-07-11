import { Injectable } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { NodesService } from "./nodes.service";

/**
 * Background liveness sweep for the node fleet. Heartbeats mark a node ONLINE
 * on arrival; this is the counterpart that marks it OFFLINE when they stop,
 * keeping the stored state (admin badge, scheduler placement filters)
 * truthful within ~30s of the offline threshold.
 */
@Injectable()
export class NodesScheduler {
  constructor(private readonly nodes: NodesService) {}

  @Interval("node-offline-sweep", 30_000)
  async sweepOffline(): Promise<void> {
    try {
      await this.nodes.sweepOfflineNodes();
    } catch {
      // Best-effort: a transient DB error just means the next sweep catches up.
    }
  }
}
