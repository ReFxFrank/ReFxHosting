/**
 * Panel ↔ Node-Agent WebSocket protocol.
 *
 * The Go node-agent (`apps/node-agent/internal/ws`) and the panel's console
 * gateway (`apps/panel-api/src/agent/console.gateway.ts`) speak this exact
 * envelope. Browser clients connect to the panel gateway, which relays to the
 * agent; the message types are identical end-to-end.
 *
 * Every frame is JSON: `{ "type": <MessageType>, "payload": <object> }`.
 */

import type { ServerState } from './enums.js';

export const MessageType = {
  // Auth (first frame from client → gateway/agent)
  AUTH: 'auth',
  AUTH_OK: 'auth.ok',
  AUTH_ERROR: 'auth.error',

  // Console
  CONSOLE_OUTPUT: 'console.output', // agent → client (a line of stdout/stderr)
  CONSOLE_COMMAND: 'console.command', // client → agent (a line written to stdin)

  // Install / reinstall / game-switch streams
  INSTALL_OUTPUT: 'install.output',

  // Power
  POWER_COMMAND: 'power.command', // client → agent: { action: PowerAction }
  POWER_EVENT: 'power.event', // agent → client: { state: ServerState }

  // Live stats
  STATS_SUBSCRIBE: 'stats.subscribe', // client → agent
  STATS: 'stats', // agent → client (ResourceStats)
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const PowerAction = {
  START: 'start',
  STOP: 'stop',
  RESTART: 'restart',
  KILL: 'kill',
} as const;
export type PowerAction = (typeof PowerAction)[keyof typeof PowerAction];

export interface WsEnvelope<T = unknown> {
  type: MessageType;
  payload: T;
}

export interface AuthPayload {
  /** Short-lived ticket issued by the panel for this server/connection. */
  ticket: string;
  serverId: string;
}

export interface ConsoleOutputPayload {
  line: string;
  stream: 'stdout' | 'stderr';
  ts: number;
}

export interface ConsoleCommandPayload {
  command: string;
}

export interface PowerCommandPayload {
  action: PowerAction;
}

export interface PowerEventPayload {
  state: ServerState;
}

export interface ResourceStats {
  cpuPct: number;
  memUsedMb: number;
  memLimitMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  players?: number;
  uptimeSec?: number;
}

export type StatsPayload = ResourceStats;

/** Helper to build a well-typed frame. */
export function frame<T>(type: MessageType, payload: T): WsEnvelope<T> {
  return { type, payload };
}
