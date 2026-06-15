// Persistent console state, shared across navigations.
//
// The Console page mounts/unmounts as the user switches server tabs. If the
// socket and output buffer lived in the page, every visit would reconnect and
// show a blank terminal. This hub keeps ONE socket per server alive and buffers
// its output, so the page can replay history on mount and keep receiving lines
// while the user is on another tab. The socket is closed after a grace period
// with no subscribers to avoid leaking connections.

import { ConsoleSocket, type ConsoleEvent, type ConsoleStats } from "@/lib/ws";
import type { ServerState } from "@/lib/types";

const MAX_LINES = 2000;
const IDLE_CLOSE_MS = 5 * 60 * 1000;

interface Entry {
  socket: ConsoleSocket;
  lines: string[];
  connected: boolean;
  state: ServerState | null;
  stats: ConsoleStats | null;
  listeners: Set<(ev: ConsoleEvent) => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const hub = new Map<string, Entry>();

function push(entry: Entry, line: string) {
  entry.lines.push(line);
  if (entry.lines.length > MAX_LINES) {
    entry.lines.splice(0, entry.lines.length - MAX_LINES);
  }
}

function ensure(serverId: string): Entry {
  const existing = hub.get(serverId);
  if (existing) return existing;

  const entry: Entry = {
    socket: undefined as unknown as ConsoleSocket,
    lines: [],
    connected: false,
    state: null,
    stats: null,
    listeners: new Set(),
    idleTimer: null,
  };
  entry.socket = new ConsoleSocket({
    serverId,
    onEvent: (ev) => {
      switch (ev.type) {
        case "open":
          entry.connected = true;
          break;
        case "close":
          entry.connected = false;
          break;
        case "line":
          push(entry, ev.line);
          break;
        case "status":
          entry.state = ev.state;
          break;
        case "stats":
          entry.stats = ev.stats;
          break;
      }
      entry.listeners.forEach((fn) => fn(ev));
    },
  });
  hub.set(serverId, entry);
  void entry.socket.connect();
  return entry;
}

export interface ConsoleHandle {
  /** Buffered output (replay on mount). */
  readonly lines: string[];
  readonly connected: boolean;
  readonly state: ServerState | null;
  readonly stats: ConsoleStats | null;
  subscribe(fn: (ev: ConsoleEvent) => void): () => void;
  sendCommand(command: string): void;
  /** Record a locally-echoed line (e.g. the command the user typed). */
  echo(line: string): void;
}

export function getConsole(serverId: string): ConsoleHandle {
  const entry = ensure(serverId);
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  return {
    get lines() {
      return entry.lines;
    },
    get connected() {
      return entry.connected;
    },
    get state() {
      return entry.state;
    },
    get stats() {
      return entry.stats;
    },
    subscribe(fn) {
      entry.listeners.add(fn);
      if (entry.idleTimer) {
        clearTimeout(entry.idleTimer);
        entry.idleTimer = null;
      }
      return () => {
        entry.listeners.delete(fn);
        // No viewers: keep the buffer briefly, then close the socket.
        if (entry.listeners.size === 0 && !entry.idleTimer) {
          entry.idleTimer = setTimeout(() => {
            entry.socket.close();
            hub.delete(serverId);
          }, IDLE_CLOSE_MS);
        }
      };
    },
    sendCommand(command) {
      entry.socket.sendCommand(command);
    },
    echo(line) {
      push(entry, line);
    },
  };
}
