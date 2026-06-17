import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Node } from '@prisma/client';
import * as tls from 'node:tls';
import { createHash } from 'node:crypto';
import { Agent as UndiciAgent, type Dispatcher } from 'undici';
import { AppConfig } from '../config/configuration';
import { CryptoService } from '../common/crypto/crypto.service';
import {
  SIGN_HEADER_NODE,
  SIGN_HEADER_SIGNATURE,
  SIGN_HEADER_TIMESTAMP,
  deriveSigningKey,
  signRequest,
  signRequestRaw,
} from './agent.signing';

/** The agent caps signed request bodies at 32 MiB; stay under it for uploads. */
export const AGENT_MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

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
  private readonly pinningEnabled: boolean;
  /** Cache one undici dispatcher per pinned cert so we don't rebuild per call. */
  private readonly dispatchers = new Map<string, UndiciAgent>();

  constructor(
    config: ConfigService,
    private readonly crypto: CryptoService,
  ) {
    this.timeoutMs = config.get<AppConfig['agent']>('agent')!.requestTimeoutMs;
    this.secretsEncKey = config.get<string>('secretsEncKey')!;
    this.pinningEnabled = config.get<AppConfig['agentTlsPinning']>('agentTlsPinning')!;
  }

  /**
   * Per-node TLS dispatcher. When pinning is enabled AND the node has a pinned
   * cert, returns an undici Agent that trusts ONLY that cert (rejecting any
   * other — i.e. MITM). Otherwise returns undefined and the call uses the
   * default transport (current self-signed-accepting behavior), so existing
   * deployments are unaffected until they opt in + pin.
   */
  private dispatcherFor(node: Node): Dispatcher | undefined {
    if (!this.pinningEnabled || !node.agentCertPem) return undefined;
    const key = `${node.id}:${node.agentCertSha256 ?? ''}`;
    let agent = this.dispatchers.get(key);
    if (!agent) {
      agent = new UndiciAgent({
        connect: {
          ca: node.agentCertPem,
          servername: node.fqdn,
          rejectUnauthorized: true,
          // We pin the EXACT leaf cert via `ca`, so the connection only succeeds
          // for that cert. Hostname matching is then redundant and would reject
          // typical self-signed agent certs (CN/SAN = localhost or an IP), so we
          // skip it — the pinned cert IS the identity check.
          checkServerIdentity: () => undefined,
        },
      });
      this.dispatchers.set(key, agent);
    }
    return agent;
  }

  /**
   * Open a one-off TLS connection to the agent and capture its leaf certificate
   * (PEM + SHA-256 fingerprint) for pinning. Trust-on-first-use: the operator
   * runs this once per node (admin "pin certificate") to record the cert.
   */
  captureCert(node: Node): Promise<{ pem: string; sha256: string }> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        {
          host: node.fqdn,
          port: node.daemonPort,
          servername: node.fqdn,
          rejectUnauthorized: false,
          timeout: this.timeoutMs,
        },
        () => {
          const cert = socket.getPeerCertificate();
          if (!cert || !cert.raw) {
            socket.destroy();
            reject(new Error('Agent presented no certificate'));
            return;
          }
          const der = cert.raw;
          const b64 = der.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
          const pem = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`;
          const sha256 = createHash('sha256').update(der).digest('hex');
          socket.end();
          resolve({ pem, sha256 });
        },
      );
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Timed out connecting to the agent'));
      });
      socket.on('error', (e) => reject(e));
    });
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

  /**
   * Ask the agent to restart itself in place (re-exec). Running game containers
   * keep running and are re-adopted when the fresh process boots. The agent
   * replies before re-executing, so this resolves quickly.
   */
  restartAgent(node: Node) {
    return this.request(node, 'POST', `/api/v1/system/restart`);
  }

  /** Wipe the node's cached steamcmd sessions (per-account home). */
  clearSteamCache(node: Node) {
    return this.request(node, 'POST', `/api/v1/system/steam-cache/clear`);
  }

  /** Self-update the agent to the latest published release, then re-exec.
   *  `githubToken` lets the agent download a private repo's release asset. */
  updateAgent(node: Node, githubToken?: string) {
    return this.request(
      node,
      'POST',
      `/api/v1/system/update`,
      githubToken ? { githubToken } : {},
      { timeoutMs: 120_000 },
    );
  }

  /** Push a server's SFTP credential to the agent so a rotation takes effect live. */
  setSftpCredential(
    node: Node,
    serverId: string,
    username: string,
    password: string,
  ) {
    return this.request(node, 'POST', `/api/v1/servers/${serverId}/sftp`, {
      username,
      password,
    });
  }

  // ---- files (proxied to the agent's jailed file manager) ----------------

  async listFiles(
    node: Node,
    serverId: string,
    path: string,
  ): Promise<FileEntry[]> {
    // The agent responds with { entries: [...] }; unwrap to the bare array.
    const res = await this.request<{ entries?: FileEntry[] } | FileEntry[]>(
      node,
      'GET',
      `/api/v1/servers/${serverId}/files/list?path=${encodeURIComponent(path)}`,
    );
    return Array.isArray(res) ? res : (res?.entries ?? []);
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

  /**
   * Stream raw binary bytes (e.g. a mod jar) to the agent's /files/write. The
   * HMAC is computed over the exact bytes, which is what the agent verifies, so
   * the upload survives intact. Used by the mod installer; subject to the agent's
   * 32 MiB signed-body cap (see AGENT_MAX_UPLOAD_BYTES).
   */
  async uploadFileBytes(
    node: Node,
    serverId: string,
    relPath: string,
    bytes: Uint8Array,
  ): Promise<void> {
    const path = `/api/v1/servers/${serverId}/files/write?path=${encodeURIComponent(
      relPath,
    )}`;
    const url = `${this.baseUrl(node)}${path}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = signRequestRaw(
      this.signingKey(node),
      'POST',
      path,
      timestamp,
      bytes,
    );

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(this.timeoutMs, 60_000),
    );
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          [SIGN_HEADER_NODE]: node.id,
          [SIGN_HEADER_TIMESTAMP]: timestamp,
          [SIGN_HEADER_SIGNATURE]: signature,
        },
        body: bytes as unknown as BodyInit,
        signal: controller.signal,
        dispatcher: this.dispatcherFor(node),
      } as RequestInit & { dispatcher?: Dispatcher });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new ServiceUnavailableException(
          `Node agent upload error ${res.status}: ${text || res.statusText}`,
        );
      }
    } catch (err: any) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ServiceUnavailableException(
        `Node ${node.name} unreachable: ${err.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
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
    // used for the panel->agent ping. A short timeout keeps "offline" snappy
    // rather than hanging on the full request timeout.
    return this.request(node, 'GET', `/healthz`, undefined, { timeoutMs: 6000 });
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
    opts?: { rawBody?: boolean; timeoutMs?: number },
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
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? this.timeoutMs);

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
        // Pin the agent's TLS cert when enabled (undici dispatcher); otherwise
        // the default transport is used.
        dispatcher: this.dispatcherFor(node),
      } as RequestInit & { dispatcher?: Dispatcher });

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
