import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AGENT_MAX_UPLOAD_BYTES,
  NodeAgentClient,
} from '../agent/agent.client';
import { ModrinthService } from './modrinth.service';

const USER_AGENT = 'ReFxHosting/1.0 (game-server-panel)';

/** Loaders Modrinth content can target, derived from the server. */
interface ModContext {
  serverId: string;
  loader: string;
  /** Directory the content is dropped into (mods/ or plugins/). */
  dir: 'mods' | 'plugins';
  /** Modrinth project_type to search. */
  projectType: 'mod' | 'plugin';
  /** Loader categories (OR-set) for Modrinth facets. */
  loaderCategories: string[];
  /** Concrete Minecraft version (or 'latest'). */
  gameVersion: string;
}

/**
 * Server-aware bridge between Modrinth and a server's mods/ (Fabric/Forge/
 * NeoForge) or plugins/ (Paper) directory. Search/version listing are filtered
 * to the server's loader + Minecraft version; install downloads the jar in the
 * panel and streams it to the agent's file API (no agent change needed).
 */
@Injectable()
export class ModsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modrinth: ModrinthService,
    private readonly agent: NodeAgentClient,
  ) {}

  /** Resolve loader/dir/version context from the server (and its node). */
  private async load(serverId: string) {
    const server = await this.prisma.server.findFirst({
      where: { id: serverId, deletedAt: null },
      include: { template: true, node: true },
    });
    if (!server) throw new NotFoundException('Server not found');

    const slug = server.template?.slug ?? '';
    const env = (server.environment ?? {}) as Record<string, unknown>;

    // Loader: unified egg carries it in LOADER; legacy eggs encode it in slug.
    let loader = String(env['LOADER'] ?? '').toLowerCase();
    if (!loader) {
      if (slug === 'minecraft-paper') loader = 'paper';
      else if (slug.startsWith('minecraft-')) loader = slug.slice('minecraft-'.length);
    }

    const isMinecraft = slug === 'minecraft' || slug.startsWith('minecraft-');
    if (!isMinecraft) {
      throw new BadRequestException('Mods are only available for Minecraft servers');
    }
    if (loader === 'vanilla' || !loader) {
      throw new BadRequestException(
        'Vanilla Minecraft cannot load mods or plugins — switch to a loader first',
      );
    }

    const isPaper = loader === 'paper';
    const ctx: ModContext = {
      serverId,
      loader,
      dir: isPaper ? 'plugins' : 'mods',
      projectType: isPaper ? 'plugin' : 'mod',
      loaderCategories: isPaper
        ? ['paper', 'purpur', 'spigot', 'bukkit', 'folia']
        : [loader],
      gameVersion: String(env['MINECRAFT_VERSION'] ?? 'latest'),
    };
    return { server, ctx };
  }

  /** Public context for the UI (so the Mods tab can label itself). */
  async context(serverId: string) {
    const { ctx } = await this.load(serverId);
    return {
      loader: ctx.loader,
      kind: ctx.projectType, // "mod" | "plugin"
      directory: ctx.dir,
      gameVersion: ctx.gameVersion,
    };
  }

  async search(serverId: string, query: string) {
    const { ctx } = await this.load(serverId);
    return this.modrinth.search({
      query,
      loaderCategories: ctx.loaderCategories,
      gameVersion: ctx.gameVersion,
      projectType: ctx.projectType,
      limit: 24,
    });
  }

  async versions(serverId: string, projectId: string) {
    const { ctx } = await this.load(serverId);
    return this.modrinth.versions(projectId, ctx.loaderCategories, ctx.gameVersion);
  }

  /** Files currently in the mods/plugins dir (best-effort; empty if absent). */
  async installed(serverId: string) {
    const { server, ctx } = await this.load(serverId);
    let entries;
    try {
      entries = await this.agent.listFiles(server.node, server.id, ctx.dir);
    } catch {
      return { directory: ctx.dir, files: [] as { name: string; size: number }[] };
    }
    const files = (entries ?? [])
      .filter((e) => !e.isDir && e.name.toLowerCase().endsWith('.jar'))
      .map((e) => ({ name: e.name, size: e.size }));
    return { directory: ctx.dir, files };
  }

  /**
   * Install a Modrinth project (latest compatible version) or a specific
   * version: download the primary jar in the panel and stream it to the agent.
   */
  async install(
    serverId: string,
    body: { projectId?: string; versionId?: string },
  ): Promise<{ installed: true; filename: string; directory: string }> {
    const { server, ctx } = await this.load(serverId);

    const version = body.versionId
      ? await this.modrinth.version(body.versionId)
      : body.projectId
        ? (await this.modrinth.versions(
            body.projectId,
            ctx.loaderCategories,
            ctx.gameVersion,
          ))[0]
        : undefined;
    if (!version) {
      throw new NotFoundException('No compatible version found to install');
    }

    const file = this.modrinth.pickFile(version);
    if (!file) throw new NotFoundException('Version has no downloadable file');
    if (file.size && file.size > AGENT_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        'This file is too large to install through the panel (32 MiB limit)',
      );
    }

    const bytes = await this.download(file.url);
    if (bytes.byteLength > AGENT_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        'This file is too large to install through the panel (32 MiB limit)',
      );
    }

    // Ensure the target directory exists, then drop the jar in.
    await this.agent.mkdir(server.node, server.id, ctx.dir).catch(() => undefined);
    const safe = this.safeName(file.filename);
    await this.agent.uploadFileBytes(server.node, server.id, `${ctx.dir}/${safe}`, bytes);

    return { installed: true, filename: safe, directory: ctx.dir };
  }

  /** Remove an installed jar by filename (no path traversal). */
  async remove(serverId: string, filename: string) {
    const { server, ctx } = await this.load(serverId);
    const safe = this.safeName(filename);
    await this.agent.deleteFiles(server.node, server.id, [`${ctx.dir}/${safe}`]);
    return { removed: true, filename: safe };
  }

  // ---- helpers ------------------------------------------------------------

  private safeName(name: string): string {
    const base = (name || '').split(/[\\/]/).pop() ?? '';
    if (!base || base === '.' || base === '..' || !base.toLowerCase().endsWith('.jar')) {
      throw new BadRequestException('Invalid file name');
    }
    return base;
  }

  private async download(url: string): Promise<Uint8Array> {
    // Modrinth CDN only; guard against being pointed elsewhere.
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      throw new BadRequestException('Invalid download URL');
    }
    if (!/(^|\.)modrinth\.com$/.test(host) && !/(^|\.)modrinth\.dev$/.test(host)) {
      throw new BadRequestException('Refusing to download from a non-Modrinth host');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new BadRequestException(`Download failed (${res.status})`);
      }
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len && len > AGENT_MAX_UPLOAD_BYTES) {
        throw new PayloadTooLargeException(
          'This file is too large to install through the panel (32 MiB limit)',
        );
      }
      return new Uint8Array(await res.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  }
}
