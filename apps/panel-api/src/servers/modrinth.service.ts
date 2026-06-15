import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

const BASE = 'https://api.modrinth.com/v2';
// Modrinth asks every client to identify itself.
const USER_AGENT = 'ReFxHosting/1.0 (game-server-panel)';
const TIMEOUT_MS = 12_000;

/** A search hit reduced to the safe fields the storefront/mod browser needs. */
export interface ModrinthProject {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  iconUrl: string | null;
  categories: string[];
  clientSide: string;
  serverSide: string;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  size: number;
  primary: boolean;
}

export interface ModrinthVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  files: ModrinthFile[];
}

/**
 * Thin proxy over the public Modrinth v2 API. Centralised here so we send a
 * proper User-Agent, avoid browser CORS, and keep upstream specifics out of the
 * rest of the app. Failures surface as 502 (BadGateway).
 */
@Injectable()
export class ModrinthService {
  private readonly logger = new Logger(ModrinthService.name);

  /**
   * Search projects, constrained to a loader + (optional) Minecraft version and
   * project type. `loaderCategories` is an OR-set (e.g. paper/spigot/bukkit).
   */
  async search(opts: {
    query: string;
    loaderCategories: string[];
    gameVersion?: string;
    projectType: string;
    limit?: number;
  }): Promise<ModrinthProject[]> {
    const facets: string[][] = [[`project_type:${opts.projectType}`]];
    if (opts.loaderCategories.length) {
      facets.push(opts.loaderCategories.map((c) => `categories:${c}`));
    }
    if (opts.gameVersion && opts.gameVersion !== 'latest') {
      facets.push([`versions:${opts.gameVersion}`]);
    }

    const params = new URLSearchParams({
      query: opts.query ?? '',
      limit: String(opts.limit ?? 24),
      index: 'relevance',
      facets: JSON.stringify(facets),
    });

    const json = await this.get<{ hits?: any[] }>(`/search?${params.toString()}`);
    return (json.hits ?? []).map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads ?? 0,
      follows: h.follows ?? 0,
      iconUrl: h.icon_url || null,
      categories: h.categories ?? [],
      clientSide: h.client_side ?? 'unknown',
      serverSide: h.server_side ?? 'unknown',
    }));
  }

  /**
   * Versions of a project compatible with the given loaders + game version,
   * newest first. Falls back to ignoring the game version when nothing matches
   * (so the picker still offers something).
   */
  async versions(
    idOrSlug: string,
    loaders: string[],
    gameVersion?: string,
  ): Promise<ModrinthVersion[]> {
    const build = (withGv: boolean) => {
      const p = new URLSearchParams();
      p.set('loaders', JSON.stringify(loaders));
      if (withGv && gameVersion && gameVersion !== 'latest') {
        p.set('game_versions', JSON.stringify([gameVersion]));
      }
      return `/project/${encodeURIComponent(idOrSlug)}/version?${p.toString()}`;
    };

    let raw = await this.get<any[]>(build(true));
    if ((!raw || raw.length === 0) && gameVersion) {
      raw = await this.get<any[]>(build(false));
    }
    return (raw ?? []).map((v) => this.mapVersion(v));
  }

  /** A single version by id. */
  async version(versionId: string): Promise<ModrinthVersion> {
    const v = await this.get<any>(`/version/${encodeURIComponent(versionId)}`);
    if (!v?.id) throw new NotFoundException('Mod version not found');
    return this.mapVersion(v);
  }

  /** The downloadable file for a version (primary, else first). */
  pickFile(version: ModrinthVersion): ModrinthFile | null {
    return version.files.find((f) => f.primary) ?? version.files[0] ?? null;
  }

  // ---- internals ----------------------------------------------------------

  private mapVersion(v: any): ModrinthVersion {
    return {
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      gameVersions: v.game_versions ?? [],
      loaders: v.loaders ?? [],
      datePublished: v.date_published,
      downloads: v.downloads ?? 0,
      files: (v.files ?? []).map((f: any) => ({
        url: f.url,
        filename: f.filename,
        size: f.size ?? 0,
        primary: !!f.primary,
      })),
    };
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (res.status === 404) throw new NotFoundException('Not found on Modrinth');
      if (!res.ok) {
        throw new BadGatewayException(`Modrinth responded ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof BadGatewayException) {
        throw err;
      }
      this.logger.warn(`Modrinth ${path} failed: ${String(err)}`);
      throw new BadGatewayException('Modrinth is unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
