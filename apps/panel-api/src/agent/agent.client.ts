import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Node } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  SIGN_HEADER_NODE,
  SIGN_HEADER_SIGNATURE,
  SIGN_HEADER_TIMESTAMP,
  deriveSigningKey,
  signRequest,
} from './agent.signing';

export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';

export interface InstallSpec {
  serverId: string;
  /** Short, user-facing id — also the SFTP username. Required by the agent. */
  shortId: string;
  dockerImage?: string;
  deployMethod: string;
  startupCommand: string;
  /** Stdout pattern the agent watches to mark the server "running". */
  startupDetect?: string;
  /** How the agent stops the server (RCON cmd, signal, or "^C"). */
  stopCommand?: string;
  environment: Record<string, string>;
  installScript: unknown;
  configFiles: unknown;
  /** Per-server SFTP credentials (username defaults to shortId). */
  sftp?: { username: string; password: string };
  /** Wipe the data volume before install (game switch with no data preserve). */
  wipe?: boolean;
  limits: {
    cpuCores: number;
    memoryMb: number;
    swapMb: number;
    diskMb: number;
    ioWeight: number;
  };
  allocations: { ip: string; port: number; isPrimary: boolean }[];
}

export interface ReconfigureSpec {
  serverId: string;
  limits: InstallSpec['limits'];
}

/** A single directory entry returned by the agent's jailed file manager. */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string;
  modifiedAt: string;
}

/** Live resource usage snapshot reported by the agent for a running server. */
export interface LiveStats {
  state: string;
  cpuPct: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  players?: number | null;
  uptimeMs?: number;
}

/**
 * Talks to the Go node-agent over HTTPS. Every request is signed with an
 * HMAC-SHA256 of (timestamp + method + path + body) keyed by the node's
 * bootstrap token, plus a nonce, so the agent can authenticate and reject
 * replays. The agent verifies against the same token (we hold the plaintext
 * only transiently when registering; here we re-derive a request signature from
 * a shared signing secret stored encrypted per node).
 *
 * Network calls use the global fetch (Node 20). Failures surface as 503 so the
 * queue processors can retry with backoff.
 */
@Injectable()
export class NodeAgentClient {
  private readonly logger = new Logger(NodeAgentClient.name);
  private readonly timeoutMs: number;
  private readonly secretsEncKey: string;

  constructor(
    config: ConfigService,
    private readonly crypto: CryptoService,
  ) {
    this.timeoutMs = config.get<AppConfig['agent']>('agent')!.requestTimeoutMs;
    this.secretsEncKey = config.get<string>('secretsEncKey')!;
  }

  // ---- power & lifecycle --------------------------------------------------

  /**
   * Server creation + install. The agent serves this at the collection root
   * (`POST /api/v1/servers`) and reads the id from the spec body.
   */
  install(node: Node, spec: InstallSpec) {
    return this.request(node, 'POST', `/api/v1/servers`, spec);
  }

  power(node: Node, serverId: string, signal: PowerSignal) {
    // The agent's power handler expects { action, timeout }.
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/power`, {
      action: signal,
    });
  }

  sendCommand(node: Node, serverId: string, command: string) {
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/command`, {
      command,
    });
  }

  reinstall(node: Node, spec: InstallSpec) {
    // The agent triggers a wipe via ?wipe=true rather than a body flag.
    const wipe = spec.wipe ? '?wipe=true' : '';
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${spec.serverId}/reinstall${wipe}`,
      spec,
    );
  }

  reconfigure(node: Node, spec: ReconfigureSpec) {
    // The agent's reconfigure handler decodes a bare Limits object.
    return this.request(
      node,
      'PATCH',
      `/api/v1/servers/${spec.serverId}/reconfigure`,
      spec.limits,
    );
  }

  deleteServer(node: Node, serverId: string) {
    return this.request(node, 'DELETE', `/api/v1/servers/${serverId}`);
  }

  // ---- files (proxied to the agent's jailed file manager) ----------------

  listFiles(node: Node, serverId: string, path: string): Promise<FileEntry[]> {
    return this.request(
      node,
      'GET',
      `/api/v1/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`,
    );
  }

  readFile(node: Node, serverId: string, path: string): Promise<{ content: string }> {
    return this.request(
      node,
      'GET',
      `/api/v1/servers/${serverId}/files/read?path=${encodeURIComponent(path)}`,
    );
  }

  writeFile(node: Node, serverId: string, path: string, content: string) {
    // The agent writes the raw request body to ?path=.
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${serverId}/files/write?path=${encodeURIComponent(path)}`,
      content,
      { rawBody: true },
    );
  }

  deleteFiles(node: Node, serverId: string, paths: string[]) {
    // The agent deletes one path per call via DELETE /files/?path=.
    return Promise.all(
      paths.map((p) =>
        this.request(
          node,
          'DELETE',
          `/api/v1/servers/${serverId}/files/?path=${encodeURIComponent(p)}`,
        ),
      ),
    );
  }

  renameFile(node: Node, serverId: string, from: string, to: string) {
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/files/rename`, {
      from,
      to,
    });
  }

  mkdir(node: Node, serverId: string, path: string) {
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${serverId}/files/mkdir?path=${encodeURIComponent(path)}`,
    );
  }

  chmod(node: Node, serverId: string, path: string, mode: string) {
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${serverId}/files/chmod?path=${encodeURIComponent(
        path,
      )}&mode=${encodeURIComponent(mode)}`,
    );
  }

  compressFiles(
    node: Node,
    serverId: string,
    paths: string[],
    destination?: string,
  ): Promise<{ dest: string }> {
    // The agent expects { dest, sources }.
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/files/compress`, {
      dest: destination,
      sources: paths,
    });
  }

  /**
   * Extract an archive. Canonical name on BOTH sides is "extract" (the agent
   * serves /files/extract; the panel formerly called /files/decompress).
   */
  decompressFile(node: Node, serverId: string, path: string, destination?: string) {
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/files/extract`, {
      source: path,
      dest: destination ?? '.',
    });
  }

  /** Ask the agent for a short-lived, signed one-time download URL. */
  fileDownloadUrl(
    node: Node,
    serverId: string,
    path: string,
  ): Promise<{ url: string }> {
    return this.request(
      node,
      'GET',
      `/api/v1/servers/${serverId}/files/download-url?path=${encodeURIComponent(path)}`,
    );
  }

  /** Ask the agent for a short-lived, signed upload URL. */
  fileUploadUrl(
    node: Node,
    serverId: string,
    path: string,
  ): Promise<{ url: string }> {
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${serverId}/files/upload-url?path=${encodeURIComponent(path)}`,
    );
  }

  // ---- backups ------------------------------------------------------------

  createBackup(node: Node, serverId: string, backupId: string, ignored: string[]) {
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/backups`, {
      backupId,
      ignoredFiles: ignored,
    });
  }

  restoreBackup(
    node: Node,
    serverId: string,
    backupId: string,
    location?: string,
  ) {
    return this.request(
      node,
      'POST',
      `/api/v1/servers/${serverId}/backups/${backupId}/restore`,
      { location: location ?? '' },
    );
  }

  deleteBackup(
    node: Node,
    serverId: string,
    backupId: string,
    location?: string,
  ) {
    return this.request(
      node,
      'DELETE',
      `/api/v1/servers/${serverId}/backups/${backupId}`,
      { location: location ?? '' },
    );
  }

  /** Signed one-time URL to download a completed backup archive. */
  backupDownloadUrl(
    node: Node,
    serverId: string,
    backupId: string,
  ): Promise<{ url: string }> {
    return this.request(
      node,
      'GET',
      `/api/v1/servers/${serverId}/backups/${backupId}/download-url`,
    );
  }

  // ---- live stats ---------------------------------------------------------

  /** Current live resource usage for a running server. */
  fetchStats(node: Node, serverId: string): Promise<LiveStats> {
    return this.request(node, 'GET', `/api/v1/servers/${serverId}/stats`);
  }

  // ---- agent config -------------------------------------------------------

  fetchAgentStatus(node: Node) {
    // /healthz is the agent's always-available liveness route (unauthenticated);
    // used for the panel->agent ping. (/api/v1/system is not served.)
    return this.request(node, 'GET', `/healthz`);
  }

  // ---- internals ----------------------------------------------------------

  baseUrl(node: Node): string {
    return `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
  }

  /**
   * Per-node signing key, derived deterministically (see agent.signing.ts).
   * The agent received the identical value at register time.
   */
  signingKey(node: Node): string {
    return deriveSigningKey(this.secretsEncKey, node.id);
  }

  private async request<T = any>(
    node: Node,
    method: string,
    path: string,
    body?: unknown,
    opts?: { rawBody?: boolean },
  ): Promise<T> {
    const url = `${this.baseUrl(node)}${path}`;
    const serialized =
      body === undefined || body === null
        ? ''
        : opts?.rawBody
          ? String(body)
          : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signRequest(
      this.signingKey(node),
      method,
      path,
      timestamp,
      serialized,
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': opts?.rawBody
            ? 'application/octet-stream'
            : 'application/json',
          [SIGN_HEADER_NODE]: node.id,
          [SIGN_HEADER_TIMESTAMP]: timestamp,
          [SIGN_HEADER_SIGNATURE]: signature,
        },
        body: serialized || undefined,
        signal: controller.signal,
        // TODO(impl): pin/verify the node's TLS cert (mTLS) instead of relying
        // on the public CA chain. For self-signed agents, supply a custom
        // https.Agent with the node's cert fingerprint.
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`agent ${method} ${path} -> ${res.status} ${text}`);
        throw new ServiceUnavailableException(
          `Node agent error ${res.status}: ${text || res.statusText}`,
        );
      }
      const ct = res.headers.get('content-type') ?? '';
      return (ct.includes('application/json')
        ? await res.json()
        : ((await res.text()) as unknown)) as T;
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;
      this.logger.error(`agent ${method} ${path} failed: ${err.message}`);
      throw new ServiceUnavailableException(
        `Node ${node.name} unreachable: ${err.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
