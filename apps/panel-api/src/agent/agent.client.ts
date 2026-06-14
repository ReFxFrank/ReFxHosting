import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import { Node } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { CryptoService } from '../common/crypto/crypto.service';

export type PowerSignal = 'start' | 'stop' | 'restart' | 'kill';

export interface InstallSpec {
  serverId: string;
  dockerImage?: string;
  deployMethod: string;
  startupCommand: string;
  environment: Record<string, string>;
  installScript: unknown;
  configFiles: unknown;
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

  constructor(
    config: ConfigService,
    private readonly crypto: CryptoService,
  ) {
    this.timeoutMs = config.get<AppConfig['agent']>('agent')!.requestTimeoutMs;
  }

  // ---- power & lifecycle --------------------------------------------------

  power(node: Node, serverId: string, signal: PowerSignal) {
    return this.request(node, 'POST', `/api/servers/${serverId}/power`, {
      signal,
    });
  }

  sendCommand(node: Node, serverId: string, command: string) {
    return this.request(node, 'POST', `/api/servers/${serverId}/command`, {
      command,
    });
  }

  install(node: Node, spec: InstallSpec) {
    return this.request(node, 'POST', `/api/servers/${spec.serverId}/install`, spec);
  }

  reinstall(node: Node, spec: InstallSpec) {
    return this.request(
      node,
      'POST',
      `/api/servers/${spec.serverId}/reinstall`,
      spec,
    );
  }

  reconfigure(node: Node, spec: ReconfigureSpec) {
    return this.request(
      node,
      'PATCH',
      `/api/servers/${spec.serverId}/limits`,
      spec,
    );
  }

  deleteServer(node: Node, serverId: string) {
    return this.request(node, 'DELETE', `/api/servers/${serverId}`);
  }

  // ---- files (proxied to agent) ------------------------------------------

  listFiles(node: Node, serverId: string, path: string) {
    return this.request(
      node,
      'GET',
      `/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
    );
  }

  // ---- backups ------------------------------------------------------------

  createBackup(node: Node, serverId: string, backupId: string, ignored: string[]) {
    return this.request(node, 'POST', `/api/servers/${serverId}/backups`, {
      backupId,
      ignoredFiles: ignored,
    });
  }

  restoreBackup(node: Node, serverId: string, backupId: string) {
    return this.request(
      node,
      'POST',
      `/api/servers/${serverId}/backups/${backupId}/restore`,
    );
  }

  // ---- agent config -------------------------------------------------------

  fetchAgentStatus(node: Node) {
    return this.request(node, 'GET', `/api/system`);
  }

  // ---- internals ----------------------------------------------------------

  baseUrl(node: Node): string {
    return `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
  }

  /**
   * Sign a request. The signing key is the per-node bootstrap token. We do not
   * persist the plaintext token, so callers pass nodes whose `tokenHash` we use
   * as the HMAC key — the agent is provisioned with the same hash as its shared
   * signing secret during bootstrap (see NodesService.generateBootstrap).
   */
  private sign(
    node: Node,
    method: string,
    path: string,
    body: string,
    timestamp: string,
    nonce: string,
  ): string {
    const payload = `${timestamp}.${nonce}.${method}.${path}.${body}`;
    return createHmac('sha256', node.tokenHash).update(payload).digest('hex');
  }

  private async request<T = any>(
    node: Node,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl(node)}${path}`;
    const serialized = body ? JSON.stringify(body) : '';
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const signature = this.sign(node, method, path, serialized, timestamp, nonce);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-refx-node': node.id,
          'x-refx-timestamp': timestamp,
          'x-refx-nonce': nonce,
          'x-refx-signature': signature,
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
