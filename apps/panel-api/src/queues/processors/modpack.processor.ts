import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { unzipSync } from 'fflate';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AGENT_MAX_UPLOAD_BYTES,
  NodeAgentClient,
} from '../../agent/agent.client';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ServersService } from '../../servers/servers.service';
import { ModrinthService } from '../../servers/modrinth.service';
import { uuidv7 } from '../../common/util/uuid';
import {
  JOB,
  ModpackInstallJob,
  ModpackUninstallJob,
  QUEUE,
} from '../queue.constants';
import { buildInstallSpec } from './install-spec.util';

const USER_AGENT = 'ReFxHosting/1.0 (game-server-panel)';
// The .mrpack is just an index + config overrides (mods download separately), so
// it stays small; cap generously to avoid pulling something pathological.
const MRPACK_MAX_BYTES = 64 * 1024 * 1024;
// Marker file written to the server's data dir recording the installed pack, so
// the Modpacks tab can show what's installed and offer an uninstall. Read back
// via the agent's file manager (same pattern as TeamSpeak's refx-voice.json).
const MODPACK_MARKER = '.refx-modpack.json';

/** A single entry in modrinth.index.json. */
interface MrpackFile {
  path: string;
  downloads: string[];
  fileSize?: number;
  env?: { client?: string; server?: string };
}
interface MrpackIndex {
  formatVersion: number;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

/**
 * Installs a Modrinth modpack (.mrpack) onto a Minecraft server:
 *   1. resolve the pack's required MC version + loader (+ loader version),
 *   2. switch the server to it and reinstall (preserving worlds),
 *   3. clear stale mods, then download every server-side mod and apply the
 *      pack's config overrides.
 * Runs as a background job because it touches many files and the network.
 */
@Processor(QUEUE.MODPACK)
export class ModpackProcessor extends WorkerHost {
  private readonly logger = new Logger(ModpackProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: NodeAgentClient,
    private readonly crypto: CryptoService,
    private readonly servers: ServersService,
    private readonly modrinth: ModrinthService,
  ) {
    super();
  }

  async process(job: Job<ModpackInstallJob | ModpackUninstallJob>): Promise<void> {
    if (job.name === JOB.UNINSTALL_MODPACK) {
      return this.processUninstall(job as Job<ModpackUninstallJob>);
    }
    if (job.name !== JOB.INSTALL_MODPACK) return;
    const { serverId, versionId, title } = job.data as ModpackInstallJob;
    const label = title || 'modpack';

    try {
      await this.install(serverId, versionId);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      await this.notify(
        serverId,
        `Modpack installed: ${label}`,
        `"${label}" was installed and your server was switched to the matching Minecraft version and loader. Start it when ready.`,
      );
      this.logger.log(`modpack install complete for ${serverId} (${label})`);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      this.logger.error(`modpack install failed for ${serverId}: ${message}`);
      await this.prisma.server
        .update({ where: { id: serverId }, data: { state: 'CRASHED' } })
        .catch(() => undefined);
      await this.notify(
        serverId,
        `Modpack install failed: ${label}`,
        `Installing "${label}" failed: ${message}. Your server was not changed beyond any loader switch already applied.`,
      );
    }
  }

  private async processUninstall(job: Job<ModpackUninstallJob>): Promise<void> {
    const { serverId, title } = job.data;
    const label = title || 'modpack';
    try {
      await this.uninstall(serverId);
      await this.prisma.server.update({
        where: { id: serverId },
        data: { state: 'OFFLINE' },
      });
      await this.notify(
        serverId,
        `Modpack uninstalled: ${label}`,
        `"${label}" was removed — its mods were cleared. Your world and the current loader/version are unchanged; switch the loader from the Minecraft tab if you want a clean vanilla server.`,
      );
      this.logger.log(`modpack uninstall complete for ${serverId}`);
    } catch (err) {
      const message = (err as Error).message ?? 'unknown error';
      this.logger.error(`modpack uninstall failed for ${serverId}: ${message}`);
      await this.prisma.server
        .update({ where: { id: serverId }, data: { state: 'OFFLINE' } })
        .catch(() => undefined);
      await this.notify(
        serverId,
        `Modpack uninstall failed: ${label}`,
        `Removing "${label}" failed: ${message}.`,
      );
    }
  }

  private async install(serverId: string, versionId: string): Promise<void> {
    // 1. Resolve the modpack version + its .mrpack file.
    const version = await this.modrinth.version(versionId);
    const file =
      version.files.find((f) => f.filename.endsWith('.mrpack')) ??
      this.modrinth.pickFile(version);
    if (!file) throw new Error('Modpack version has no downloadable file');

    const packBytes = await this.download(file.url, MRPACK_MAX_BYTES);
    const entries = unzipSync(packBytes);
    const indexRaw = entries['modrinth.index.json'];
    if (!indexRaw) throw new Error('Invalid .mrpack: missing modrinth.index.json');
    const index = JSON.parse(
      Buffer.from(indexRaw).toString('utf8'),
    ) as MrpackIndex;

    // 2. Derive loader + versions from the pack dependencies.
    const deps = index.dependencies ?? {};
    const gameVersion = deps['minecraft'];
    if (!gameVersion) throw new Error('Modpack does not specify a Minecraft version');
    const { loader, loaderVersion } = this.resolveLoader(deps);

    // 3. Apply the loader/version to the server (no reinstall yet).
    await this.servers.applyMinecraftEnv(serverId, {
      loader,
      version: gameVersion,
      loaderVersion,
    });

    // 4. Reinstall to provision the new loader/version, preserving worlds.
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: {
        node: true,
        template: { include: { variables: true } },
        allocations: true,
        variables: true,
      },
    });
    if (!server || !server.template) throw new Error('Server missing template');
    const sftpPassword = server.sftpPasswordEnc
      ? this.crypto.decrypt(server.sftpPasswordEnc)
      : undefined;
    await this.agent.reinstall(
      server.node,
      buildInstallSpec(server, { wipe: false, sftpPassword }),
    );

    // 5. Clear stale mods so a previous loader's jars don't conflict.
    await this.clearMods(server.node, server.id);

    // 6. Download every server-side mod listed in the index.
    const createdDirs = new Set<string>();
    let installed = 0;
    let skipped = 0;
    for (const f of index.files ?? []) {
      if (f.env?.server === 'unsupported') continue;
      const url = f.downloads?.[0];
      if (!url || !this.isModrinthHost(url)) {
        skipped++;
        continue;
      }
      if (f.fileSize && f.fileSize > AGENT_MAX_UPLOAD_BYTES) {
        this.logger.warn(`skipping oversized pack file ${f.path}`);
        skipped++;
        continue;
      }
      try {
        const bytes = await this.download(url, AGENT_MAX_UPLOAD_BYTES);
        await this.writeFile(server.node, server.id, f.path, bytes, createdDirs);
        installed++;
      } catch (e) {
        this.logger.warn(`failed to install ${f.path}: ${String(e)}`);
        skipped++;
      }
    }

    // 7. Apply config overrides bundled in the .mrpack (server + shared, not client).
    for (const [name, bytes] of Object.entries(entries)) {
      if (name.endsWith('/')) continue; // directory entry
      let rel: string | null = null;
      if (name.startsWith('overrides/')) rel = name.slice('overrides/'.length);
      else if (name.startsWith('server-overrides/'))
        rel = name.slice('server-overrides/'.length);
      if (!rel) continue; // skip client-overrides/ and metadata
      if (bytes.byteLength > AGENT_MAX_UPLOAD_BYTES) continue;
      try {
        await this.writeFile(server.node, server.id, rel, bytes, createdDirs);
      } catch (e) {
        this.logger.warn(`failed to apply override ${rel}: ${String(e)}`);
      }
    }

    // 8. Record what's installed so the Modpacks tab can show it + offer removal.
    const marker = {
      projectId: version.projectId,
      versionId: version.id,
      title: version.name,
      versionNumber: version.versionNumber,
      mcVersion: gameVersion,
      loader,
      loaderVersion,
      filesInstalled: installed,
      installedAt: new Date().toISOString(),
    };
    await this.writeFile(
      server.node,
      server.id,
      MODPACK_MARKER,
      new TextEncoder().encode(JSON.stringify(marker, null, 2)),
      createdDirs,
    ).catch((e) =>
      this.logger.warn(`failed to write modpack marker: ${String(e)}`),
    );

    this.logger.log(
      `modpack ${serverId}: ${installed} files installed, ${skipped} skipped`,
    );
  }

  /**
   * Uninstall the current modpack: clear the mods folder and remove the marker.
   * The world and the chosen loader/version are left intact (the customer can
   * switch back to vanilla from the Minecraft tab if they want a clean server).
   */
  private async uninstall(serverId: string): Promise<void> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      include: { node: true },
    });
    if (!server) throw new Error('Server not found');
    await this.clearMods(server.node, server.id);
    await this.agent
      .deleteFiles(server.node, server.id, [MODPACK_MARKER])
      .catch(() => undefined);
  }

  // ---- helpers ------------------------------------------------------------

  private resolveLoader(deps: Record<string, string>): {
    loader: string;
    loaderVersion: string;
  } {
    if (deps['fabric-loader'])
      return { loader: 'fabric', loaderVersion: deps['fabric-loader'] };
    if (deps['neoforge'])
      return { loader: 'neoforge', loaderVersion: deps['neoforge'] };
    if (deps['forge']) return { loader: 'forge', loaderVersion: deps['forge'] };
    if (deps['quilt-loader']) {
      throw new Error('Quilt modpacks are not supported yet');
    }
    // No loader dependency → vanilla pack (datapacks/config only).
    return { loader: 'vanilla', loaderVersion: 'latest' };
  }

  private async clearMods(node: any, serverId: string): Promise<void> {
    try {
      const entries = await this.agent.listFiles(node, serverId, 'mods');
      const jars = (entries ?? [])
        .filter((e) => !e.isDir && e.name.toLowerCase().endsWith('.jar'))
        .map((e) => `mods/${e.name}`);
      if (jars.length) await this.agent.deleteFiles(node, serverId, jars);
    } catch {
      // mods/ may not exist yet — nothing to clear.
    }
  }

  /** Write a file, best-effort creating its parent directory first (deduped). */
  private async writeFile(
    node: any,
    serverId: string,
    relPath: string,
    bytes: Uint8Array,
    createdDirs: Set<string>,
  ): Promise<void> {
    const clean = relPath.replace(/^\/+/, '');
    if (clean.includes('..')) throw new Error(`unsafe path ${relPath}`);
    const slash = clean.lastIndexOf('/');
    if (slash > 0) {
      const dir = clean.slice(0, slash);
      if (!createdDirs.has(dir)) {
        await this.agent.mkdir(node, serverId, dir).catch(() => undefined);
        createdDirs.add(dir);
      }
    }
    await this.agent.uploadFileBytes(node, serverId, clean, bytes);
  }

  private isModrinthHost(url: string): boolean {
    try {
      const host = new URL(url).host;
      return /(^|\.)modrinth\.com$/.test(host) || /(^|\.)modrinth\.dev$/.test(host);
    } catch {
      return false;
    }
  }

  private async download(url: string, maxBytes: number): Promise<Uint8Array> {
    if (!this.isModrinthHost(url)) {
      throw new Error('Refusing to download from a non-Modrinth host');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len && len > maxBytes) throw new Error('file exceeds size limit');
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) throw new Error('file exceeds size limit');
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }

  private async notify(
    serverId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const server = await this.prisma.server
      .findUnique({ where: { id: serverId }, select: { ownerId: true } })
      .catch(() => null);
    if (!server?.ownerId) return;
    await this.prisma.notification
      .create({
        data: { id: uuidv7(), userId: server.ownerId, channel: 'IN_APP', title, body },
      })
      .catch(() => undefined);
  }
}
