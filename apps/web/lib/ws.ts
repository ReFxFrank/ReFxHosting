// Console WebSocket helper.
// The panel-api brokers a short-lived ticket; the browser then connects to the
// node's console socket and exchanges newline-delimited JSON frames:
//   <- { type: "auth_success" } | { type: "console_output", line } | { type: "stats", ... } | { type: "status", state }
//   -> { type: "auth", token } | { type: "command", command } | { type: "power", signal }
//
// Reconnects with exponential backoff and re-authenticates automatically.

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

export type ConsoleEvent =
  | { type: "open" }
  | { type: "close" }
  | { type: "line"; line: string }
  | { type: "stats"; stats: ConsoleStats }
  | { type: "status"; state: ServerState }
  | { type: "error"; message: string };

type Listener = (event: ConsoleEvent) => void;

function wsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  return API_URL.replace(/^http/, "ws");
}

export interface ConsoleSocketOptions {
  serverId: string;
  onEvent: Listener;
  /** Override the token-broker fetch (testing). */
  fetchTicket?: () => Promise<{ url: string; token: string }>;
}

export class ConsoleSocket {
  private serverId: string;
  private onEvent: Listener;
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private backoff = 1000;
  private fetchTicket: () => Promise<{ url: string; token: string }>;

  constructor(opts: ConsoleSocketOptions) {
    this.serverId = opts.serverId;
    this.onEvent = opts.onEvent;
    this.fetchTicket =
      opts.fetchTicket ??
      (async () => {
        // Ask the panel-api for a scoped console ticket. The response tells us
        // which node socket to dial and supplies the per-connection token.
        const tokens = getTokens();
        const res = await fetch(
          `${API_URL}/api/v1/servers/${this.serverId}/console/ticket`,
          {
            method: "POST",
            headers: tokens?.accessToken
              ? { Authorization: `Bearer ${tokens.accessToken}` }
              : {},
          },
        );
        if (!res.ok) throw new Error("Failed to obtain console ticket");
        const data = (await res.json()) as { url?: string; token: string; node?: string };
        // If the api returns a relative node path, build the absolute ws url.
        const url =
          data.url ??
          `${wsBase()}/api/v1/servers/${this.serverId}/console`;
        return { url, token: data.token };
      });
  }

  async connect() {
    this.closedByUser = false;
    let ticket: { url: string; token: string };
    try {
      ticket = await this.fetchTicket();
    } catch (e) {
      this.onEvent({ type: "error", message: (e as Error).message });
      this.scheduleReconnect();
      return;
    }

    try {
      this.ws = new WebSocket(ticket.url);
    } catch (e) {
      this.onEvent({ type: "error", message: (e as Error).message });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoff = 1000;
      this.send({ type: "auth", token: ticket.token });
      this.onEvent({ type: "open" });
    };

    this.ws.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };

    this.ws.onerror = () => {
      this.onEvent({ type: "error", message: "Console connection error" });
    };

    this.ws.onclose = () => {
      this.onEvent({ type: "close" });
      if (!this.closedByUser) this.scheduleReconnect();
    };
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;
    // Support both single frames and newline-delimited batches.
    for (const chunk of raw.split("\n")) {
      const text = chunk.trim();
      if (!text) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text);
      } catch {
        // Treat unparseable text as raw console output.
        this.onEvent({ type: "line", line: text });
        continue;
      }
      switch (msg.type) {
        case "console_output":
        case "line":
          this.onEvent({ type: "line", line: String(msg.line ?? msg.data ?? "") });
          break;
        case "stats":
          this.onEvent({ type: "stats", stats: msg as unknown as ConsoleStats });
          break;
        case "status":
          this.onEvent({ type: "status", state: msg.state as ServerState });
          break;
        case "auth_success":
          break;
        case "error":
          this.onEvent({ type: "error", message: String(msg.message ?? "error") });
          break;
        default:
          break;
      }
    }
  }

  private scheduleReconnect() {
    if (this.closedByUser) return;
    const delay = Math.min(this.backoff, 15000);
    this.backoff = Math.min(this.backoff * 2, 15000);
    setTimeout(() => {
      if (!this.closedByUser) void this.connect();
    }, delay);
  }

  send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendCommand(command: string) {
    this.send({ type: "command", command });
  }

  sendPower(signal: "start" | "stop" | "restart" | "kill") {
    this.send({ type: "power", signal });
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}
