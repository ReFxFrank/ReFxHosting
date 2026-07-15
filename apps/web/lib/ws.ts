// Console client — talks to the panel-api Socket.IO gateway (namespace
// /ws/console). The browser authenticates with its access token, subscribes to
// a server room, then receives `console` / `stats` / `power` events and sends
// `command` events. (Console output + stats originate on the node-agent and are
// relayed to the gateway via the agent callback endpoints.)

import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/api";
import { getTokens } from "@/lib/auth";
import type { ServerState } from "@/lib/types";

export interface ConsoleStats {
  cpuPct: number;
  memUsedMb: number;
  memLimitMb: number;
  diskUsedMb: number;
  diskLimitMb: number;
  netRxBytes: number;
  netTxBytes: number;
  players?: number;
  uptimeMs?: number;
}

/** One replayed backlog line — byte-compatible with a live `console` frame. */
export interface ConsoleHistoryLine {
  type: "console";
  seq: number;
  line: string;
  stream: string;
  at: number;
}

export type ConsoleEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "line"; line: string }
  | { type: "history"; lines: ConsoleHistoryLine[] }
  | { type: "stats"; stats: ConsoleStats }
  | { type: "status"; state: ServerState }
  | { type: "error"; message: string };

type Listener = (event: ConsoleEvent) => void;

export interface ConsoleSocketOptions {
  serverId: string;
  onEvent: Listener;
}

function extractLine(frame: unknown): string {
  if (typeof frame === "string") return frame;
  const f = (frame ?? {}) as Record<string, unknown>;
  return String(f.line ?? f.message ?? f.data ?? "");
}

function mapStats(frame: unknown): ConsoleStats {
  const f = (frame ?? {}) as Record<string, number | undefined>;
  return {
    cpuPct: f.cpuPct ?? 0,
    memUsedMb: f.memUsedMb ?? 0,
    memLimitMb: f.memLimitMb ?? 0,
    diskUsedMb: f.diskUsedMb ?? 0,
    diskLimitMb: f.diskLimitMb ?? 0,
    netRxBytes: f.netRxBytes ?? 0,
    netTxBytes: f.netTxBytes ?? 0,
    players: f.players,
  };
}

export class ConsoleSocket {
  private serverId: string;
  private onEvent: Listener;
  private socket: Socket | null = null;

  constructor(opts: ConsoleSocketOptions) {
    this.serverId = opts.serverId;
    this.onEvent = opts.onEvent;
  }

  async connect() {
    const tokens = getTokens();
    const socket = io(`${API_URL}/ws/console`, {
      auth: { token: tokens?.accessToken },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelayMax: 15000,
      withCredentials: false,
    });
    this.socket = socket;

    socket.on("connect", () => {
      socket.emit("subscribe", { serverId: this.serverId });
      this.onEvent({ type: "open" });
    });
    socket.on("subscribed", () => {
      /* room joined */
    });
    // Backlog replayed to this socket on subscribe (oldest -> newest). Each line
    // is byte-compatible with a live `console` frame plus a monotonic `seq`.
    socket.on("console_history", (payload: unknown) => {
      const lines = ((payload as { lines?: unknown })?.lines ?? []) as
        | ConsoleHistoryLine[]
        | unknown[];
      this.onEvent({
        type: "history",
        lines: Array.isArray(lines) ? (lines as ConsoleHistoryLine[]) : [],
      });
    });
    socket.on("console", (frame: unknown) =>
      this.onEvent({ type: "line", line: extractLine(frame) }),
    );
    socket.on("stats", (frame: unknown) => {
      this.onEvent({ type: "stats", stats: mapStats(frame) });
      // The agent's stat sample carries the live server state; surface it so the
      // console badge stays in sync while the server runs.
      const st = (frame as { state?: string })?.state;
      if (st) this.onEvent({ type: "status", state: st as ServerState });
    });
    socket.on("power", (frame: unknown) => {
      const state = (frame as { state?: string })?.state;
      if (state) this.onEvent({ type: "status", state: state as ServerState });
    });
    socket.on("error", (e: unknown) =>
      this.onEvent({
        type: "error",
        message: (e as { message?: string })?.message ?? "Console error",
      }),
    );
    socket.on("connect_error", (e: Error) =>
      this.onEvent({ type: "error", message: e.message }),
    );
    socket.on("disconnect", () => this.onEvent({ type: "close" }));
  }

  sendCommand(command: string) {
    this.socket?.emit("command", { command });
  }

  /** Power actions go over REST (api.servers.power); kept for API compatibility. */
  sendPower(signal: "start" | "stop" | "restart" | "kill") {
    this.socket?.emit("power", { signal });
  }

  close() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
