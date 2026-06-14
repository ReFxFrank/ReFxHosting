/**
 * Cross-cutting DTO shapes shared between the panel-api and web client.
 * These describe the wire format of common API responses.
 */

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Stable machine-readable error code, e.g. "server.not_stopped". */
  code?: string;
  path?: string;
  timestamp?: string;
}

/** Payload accepted by the game-switching endpoint (the signature feature). */
export interface SwitchGameRequest {
  templateId: string;
  /** When false, the agent wipes the server volume before installing. */
  preserveData: boolean;
  /** Optional overrides for the new template's variables. */
  variables?: Record<string, string>;
}

export interface ResizeRequest {
  cpuCores?: number;
  memoryMb?: number;
  diskMb?: number;
}

/** Spec the panel sends to the node-agent to (re)install a server. */
export interface ServerInstallSpec {
  serverId: string;
  shortId: string;
  deployMethod: string;
  dockerImage?: string;
  startupCommand: string;
  startupDetect?: string;
  stopCommand: string;
  environment: Record<string, string>;
  limits: {
    cpuCores: number;
    memoryMb: number;
    swapMb: number;
    diskMb: number;
    ioWeight: number;
  };
  allocations: { ip: string; port: number; primary: boolean }[];
  installScript: unknown;
  configFiles: unknown;
  preserveData: boolean;
}
