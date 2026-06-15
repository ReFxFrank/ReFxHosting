import { Injectable, Logger } from '@nestjs/common';

/**
 * Resolves a possibly-"latest" Minecraft version into a concrete version string,
 * per loader, querying the SAME upstream each loader's install script uses so the
 * resolved version is one that actually has a build available.
 *
 * Why this matters: the panel must choose the runtime JVM image up-front, and the
 * right Java depends on the concrete Minecraft version (e.g. 26.1.2 needs Java 25,
 * 1.20.4 needs 17). If we left the version as "latest" we'd have to guess the JVM
 * — and guessing is what broke Forge/NeoForge (both resolve to 26.1.2). Resolving
 * here makes the JVM choice exact.
 *
 * Network failures are non-fatal: we return "latest" unchanged and let the install
 * script's own resolution handle it (the JVM then falls back to newest, which is
 * the safe direction for a modern release).
 */
@Injectable()
export class MinecraftResolverService {
  private readonly logger = new Logger(MinecraftResolverService.name);
  private static readonly TIMEOUT_MS = 8000;

  /** Resolve `requested` ("latest" or a concrete version) for a template slug. */
  async resolve(
    slug: string | null | undefined,
    requested: string | null | undefined,
  ): Promise<string> {
    const v = (requested ?? '').trim();
    if (!v || v.toLowerCase() !== 'latest') return v || 'latest';

    try {
      switch (slug) {
        case 'minecraft-paper':
          return await this.paperLatest();
        case 'minecraft-fabric':
          return await this.mojangLatestRelease();
        case 'minecraft-forge':
          return await this.forgeLatestMc();
        case 'minecraft-neoforge':
          return await this.neoforgeLatestMc();
        default:
          return 'latest';
      }
    } catch (err) {
      this.logger.warn(
        `Could not resolve latest version for ${slug}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'latest';
    }
  }

  /**
   * Resolve "latest" for the unified `minecraft` egg, where the loader is chosen
   * per-server (not encoded in the slug). Non-"latest" passes through.
   */
  async resolveByLoader(
    loader: string,
    requested: string | null | undefined,
  ): Promise<string> {
    const v = (requested ?? '').trim();
    if (!v || v.toLowerCase() !== 'latest') return v || 'latest';
    try {
      switch (loader) {
        case 'paper':
          return await this.paperLatest();
        case 'forge':
          return await this.forgeLatestMc();
        case 'neoforge':
          return await this.neoforgeLatestMc();
        case 'vanilla':
        case 'fabric':
        default:
          return await this.mojangLatestRelease();
      }
    } catch (err) {
      this.logger.warn(
        `Could not resolve latest for loader ${loader}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 'latest';
    }
  }

  // ---- per-loader resolvers ----------------------------------------------

  private async paperLatest(): Promise<string> {
    // Paper tracks Mojang's release closely; use Mojang's latest release as the
    // source of truth (the deprecated Paper v2 API returns a stale version list).
    // Only used for JVM selection here — the egg downloads the actual jar.
    return this.mojangLatestRelease();
  }

  private async mojangLatestRelease(): Promise<string> {
    const json = await this.getJson<{ latest?: { release?: string } }>(
      'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json',
    );
    return json.latest?.release || 'latest';
  }

  private async forgeLatestMc(): Promise<string> {
    const json = await this.getJson<{ promos?: Record<string, string> }>(
      'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
    );
    const mcs = [
      ...new Set(
        Object.keys(json.promos ?? {}).map((k) =>
          k.replace(/-(recommended|latest)$/, ''),
        ),
      ),
    ].filter(Boolean);
    if (mcs.length === 0) return 'latest';
    mcs.sort((a, b) => this.compareVersions(a, b));
    return mcs[mcs.length - 1];
  }

  private async neoforgeLatestMc(): Promise<string> {
    const xml = await this.getText(
      'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    );
    const builds = (xml.match(/<version>([^<]+)<\/version>/g) ?? []).map((m) =>
      m.replace(/<\/?version>/g, ''),
    );
    const stable = builds.filter((b) => !b.includes('-beta'));
    const newest = (stable.length ? stable : builds).at(-1);
    return newest ? this.neoforgeBuildToMc(newest) : 'latest';
  }

  // ---- helpers ------------------------------------------------------------

  /**
   * Derive the Minecraft version a NeoForge build targets:
   *  - calendar builds "26.1.2.76" (4 parts)  -> "26.1.2"
   *  - classic builds  "21.1.73"   (3 parts)  -> "1.21.1" ("21.0.x" -> "1.21")
   */
  private neoforgeBuildToMc(build: string): string {
    const parts = build.split('.');
    if (parts.length >= 4) return parts.slice(0, 3).join('.');
    const minor = parts[0] ?? '0';
    const patch = parts[1] ?? '0';
    return patch === '0' ? `1.${minor}` : `1.${minor}.${patch}`;
  }

  /** Numeric, segment-wise version comparison (handles 1.x.y and 26.x.y). */
  private compareVersions(a: string, b: string): number {
    const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
    const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  private async getJson<T>(url: string): Promise<T> {
    return (await this.fetchWithTimeout(url, 'application/json')).json() as Promise<T>;
  }

  private async getText(url: string): Promise<string> {
    return (await this.fetchWithTimeout(url, 'application/xml')).text();
  }

  private async fetchWithTimeout(url: string, accept: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      MinecraftResolverService.TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        headers: { Accept: accept },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${url} responded ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
