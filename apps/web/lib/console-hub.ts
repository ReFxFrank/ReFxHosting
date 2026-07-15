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
const PERSIST_MS = 700;

interface Entry {
  serverId: string;
  socket: ConsoleSocket;
  lines: string[];
  connected: boolean;
  state: ServerState | null;
  stats: ConsoleStats | null;
  listeners: Set<(ev: ConsoleEvent) => void>;
  idleTimer: ReturnType<typeof setTimeout> | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const hub = new Map<string, Entry>();

// sessionStorage persistence so a full page refresh (new JS context, where the
// in-memory hub is gone) still restores recent console output. Cleared when the
// tab/session closes.
const persistKey = (serverId: string) => `refx.console.${serverId}`;

function loadPersisted(serverId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(persistKey(serverId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]).slice(-MAX_LINES) : [];
  } catch {
    return [];
  }
}

function flush(entry: Entry) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(persistKey(entry.serverId), JSON.stringify(entry.lines));
  } catch {
    /* quota / unavailable — ignore */
  }
}

function schedulePersist(entry: Entry) {
  if (entry.saveTimer) return;
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    flush(entry);
  }, PERSIST_MS);
}

// A full page refresh discards the in-memory hub before any debounced write
// fires, so flush every buffer synchronously as the page unloads. This keeps
// the most recent lines available for replay in the next JS context.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    hub.forEach((entry) => flush(entry));
  });
}

function push(entry: Entry, line: string) {
  entry.lines.push(line);
  if (entry.lines.length > MAX_LINES) {
    entry.lines.splice(0, entry.lines.length - MAX_LINES);
  }
  schedulePersist(entry);
}

function ensure(serverId: string): Entry {
  const existing = hub.get(serverId);
  if (existing) return existing;

  const entry: Entry = {
    serverId,
    socket: undefined as unknown as ConsoleSocket,
    lines: loadPersisted(serverId),
    connected: false,
    state: null,
    stats: null,
    listeners: new Set(),
    idleTimer: null,
    saveTimer: null,
  };
  entry.socket = new ConsoleSocket({
    serverId,
    onEvent: (ev) => {
      // Backlog replay: seed scrollback only when we have no buffered lines yet
      // (a genuinely blank console — fresh load / first connect). If the buffer
      // already holds output (tab switch, reconnect within the session), it
      // already covers this history, so we skip it to avoid duplicates. Forward
      // each seeded line as a normal `line` event so the live terminal renders
      // it in order, ahead of subsequent live output.
      if (ev.type === "history") {
        if (entry.lines.length === 0) {
          for (const h of ev.lines) {
            push(entry, h.line);
            entry.listeners.forEach((fn) => fn({ type: "line", line: h.line }));
          }
        }
        return;
      }
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
