import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../common/redis/redis.service";
import { AppConfig } from "../config/configuration";

/**
 * One console line as it is stored and replayed. BYTE-IDENTICAL to a live
 * `console` event payload, plus a `seq`:
 *   - `seq` is a monotonic, per-server sequence number (Redis INCR). It gives
 *     every line a stable unique id so a client can order lines and exactly
 *     de-duplicate a replayed backlog against anything it already buffered.
 * Live `console` frames carry the SAME `seq` (assigned here in `record`), so the
 * batched history and the live stream share one ordering.
 */
export interface ConsoleFrame {
  type: "console";
  seq: number;
  line: string;
  stream: string; // "stdout" | "install" | "system"
  at: number; // unix millis
}

/** A raw line before a seq is assigned. */
export interface RawConsoleLine {
  line: string;
  stream: string;
  at: number;
}

/**
 * Redis-backed ring buffer of recent console output, one bounded list per
 * server. Chosen over an in-memory buffer because the panel runs multiple
 * replicas (k8s Helm defaults panelApi.replicas=3): a line received by the
 * agent-callback on replica A must be replayable to a socket that landed on
 * replica B, and the buffer must survive a panel restart. Redis is already a
 * core dependency, so this adds no new infra.
 *
 * Both operations are fail-open: Redis being unavailable must never break live
 * console streaming (record) or the subscribe handshake (recent).
 */
@Injectable()
export class ConsoleHistoryService {
  private readonly logger = new Logger(ConsoleHistoryService.name);
  private readonly cap: number;
  private readonly ttl: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const c = config.get<AppConfig["console"]>("console")!;
    this.cap = Math.max(1, c.historyMax);
    this.ttl = Math.max(1, c.historyTtlSeconds);
  }

  private histKey(serverId: string): string {
    return `console:hist:${serverId}`;
  }

  private seqKey(serverId: string): string {
    return `console:seq:${serverId}`;
  }

  /**
   * Assign a monotonic seq to each raw line (in order), persist the frames to the
   * server's capped Redis list, and return the seq-stamped frames so the caller
   * can emit them live with the SAME seq. Order is preserved. On any Redis error
   * the frames are still returned (with seq 0) so live streaming continues; only
   * the persisted backlog is skipped.
   */
  async record(
    serverId: string,
    lines: RawConsoleLine[],
  ): Promise<ConsoleFrame[]> {
    if (lines.length === 0) return [];
    try {
      // Reserve a contiguous seq range in one round-trip. INCRBY returns the END
      // of the range; the first line's seq is (end - n + 1).
      const end = await this.redis.client.incrby(
        this.seqKey(serverId),
        lines.length,
      );
      const base = end - lines.length;
      const frames: ConsoleFrame[] = lines.map((l, i) => ({
        type: "console",
        seq: base + i + 1,
        line: l.line,
        stream: l.stream,
        at: l.at,
      }));

      const pipe = this.redis.client.pipeline();
      for (const f of frames) pipe.rpush(this.histKey(serverId), JSON.stringify(f));
      // Keep only the last `cap` entries, then refresh the TTL on the list and the
      // seq counter so an active server never resets its sequence.
      pipe.ltrim(this.histKey(serverId), -this.cap, -1);
      pipe.expire(this.histKey(serverId), this.ttl);
      pipe.expire(this.seqKey(serverId), this.ttl);
      await pipe.exec();
      return frames;
    } catch (e) {
      this.logger.warn(
        `console history record failed for ${serverId}: ${String(
          (e as Error)?.message ?? e,
        )}`,
      );
      // Degraded: emit live without a persisted seq. Clients dedup by `at` here.
      return lines.map((l) => ({
        type: "console",
        seq: 0,
        line: l.line,
        stream: l.stream,
        at: l.at,
      }));
    }
  }

  /**
   * The recent backlog for a server, oldest -> newest (matching render order),
   * capped at `historyMax`. Empty when there is no history or Redis is down.
   */
  async recent(serverId: string): Promise<ConsoleFrame[]> {
    try {
      const raw = await this.redis.client.lrange(this.histKey(serverId), 0, -1);
      const out: ConsoleFrame[] = [];
      for (const r of raw) {
        try {
          out.push(JSON.parse(r) as ConsoleFrame);
        } catch {
          // Skip any malformed entry rather than fail the whole replay.
        }
      }
      return out;
    } catch (e) {
      this.logger.warn(
        `console history read failed for ${serverId}: ${String(
          (e as Error)?.message ?? e,
        )}`,
      );
      return [];
    }
  }
}
