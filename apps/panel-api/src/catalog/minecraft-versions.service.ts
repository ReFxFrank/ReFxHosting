import { Injectable, Logger } from '@nestjs/common';

/**
 * Loader-aware Minecraft version + build catalog for the version pickers (order
 * flow + in-panel "Loader & version" card).
 *
 * Each loader has its OWN list of supported Minecraft versions, sourced from the
 * SAME upstream its install script downloads from — so the dropdown never offers
 * a version that loader can't actually build:
 *   - vanilla  → Mojang version manifest (releases)
 *   - paper    → PaperMC project versions
 *   - fabric   → FabricMC game versions (stable)
 *   - forge    → Forge promotions (versions that have a recommended/latest build)
 *   - neoforge → NeoForge maven metadata (MC versions derived from build numbers)
 *
 * "Builds" are the loader-specific sub-version for a given Minecraft version:
 *   - fabric   → Fabric loader versions (Minecraft-independent)
 *   - forge    → Forge build numbers for that Minecraft version
 *   - neoforge → NeoForge build versions targeting that Minecraft version
 *   - vanilla/paper → none (the egg auto-picks the newest server build)
 *
 * Everything is cached in-memory (~1h) and degrades gracefully: a fetch failure
 * returns the last good value, or a small hardcoded fallback, and never throws.
 */
@Injectable()
export class MinecraftVersionsService {
  private readonly logger = new Logger(MinecraftVersionsService.name);

  private static readonly TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly CAP = 80;
  private static readonly TIMEOUT_MS = 8000;

  /** Known-good releases, newest first — used when Mojang is unreachable. */
  private static readonly FALLBACK: string[] = [
    '1.21.4',
    '1.21.3',
    '1.21.1',
    '1.21',
    '1.20.6',
    '1.20.4',
    '1.20.1',
    '1.19.4',
    '1.18.2',
    '1.16.5',
  ];

  private readonly cache = new Map<string, { value: string[]; at: number }>();

  /**
   * Minecraft versions supported by `loader`, newest first. Backwards-compatible:
   * called with no loader it returns Mojang's release list (the old behaviour).
   */
  async list(loader?: string): Promise<string[]> {
    switch ((loader ?? 'vanilla').toLowerCase()) {
      case 'paper':
        return this.cachedList('paper:mc', () => this.paperVersions());
      case 'fabric':
        return this.cachedList('fabric:mc', () => this.fabricGameVersions());
      case 'forge':
        return this.cachedList('forge:mc', () => this.forgeMcVersions());
      case 'neoforge':
        return this.cachedList('neoforge:mc', () => this.neoforgeMcVersions());
      case 'vanilla':
      default:
        return this.cachedList('vanilla:mc', () => this.mojangReleases());
    }
  }

  /**
   * Loader build versions for `loader` at Minecraft `mc`, newest first. Empty for
   * loaders without a build concept (vanilla/paper). Never throws.
   */
  async builds(loader: string, mc: string): Promise<string[]> {
    const l = (loader ?? '').toLowerCase();
    const v = (mc ?? '').trim();
    switch (l) {
      case 'fabric':
        // Fabric's loader is Minecraft-version-independent.
        return this.cachedList('fabric:loader', () => this.fabricLoaderVersions());
      case 'forge':
        if (!v || v === 'latest') return [];
        return this.cachedList(`forge:builds:${v}`, () => this.forgeBuilds(v));
      case 'neoforge':
        if (!v || v === 'latest') return [];
        return this.cachedList(`neoforge:builds:${v}`, () =>
          this.neoforgeBuilds(v),
        );
      default:
        return [];
    }
  }

  // ---- caching ------------------------------------------------------------

  private async cachedList(
    key: string,
    fn: () => Promise<string[]>,
  ): Promise<string[]> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < MinecraftVersionsService.TTL_MS) {
      return hit.value;
    }
    try {
      const value = await fn();
      if (value.length === 0) throw new Error('empty list');
      this.cache.set(key, { value, at: now });
      return value;
    } catch (err) {
      this.logger.warn(
        `Minecraft catalog fetch failed (${key}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Serve the last good value if we have one; otherwise nothing (callers that
      // need a non-empty list, like vanilla, override this in their helper).
      if (hit) return hit.value;
      return [];
    }
  }

  // ---- per-loader version lists -------------------------------------------

  private async mojangReleases(): Promise<string[]> {
    try {
      const json = await this.getJson<{
        versions?: { id: string; type: string }[];
      }>('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
      const versions = (json.versions ?? [])
        .filter((v) => v.type === 'release')
        .map((v) => v.id)
        .slice(0, MinecraftVersionsService.CAP);
      if (versions.length === 0) throw new Error('no releases in manifest');
      return versions;
    } catch (err) {
      this.logger.warn(
        `Mojang manifest unavailable, using fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return MinecraftVersionsService.FALLBACK;
    }
  }

  private async paperVersions(): Promise<string[]> {
    // PaperMC v2 project endpoint lists versions oldest→newest.
    const json = await this.getJson<{ versions?: string[] }>(
      'https://api.papermc.io/v2/projects/paper',
    );
    return (json.versions ?? [])
      .slice()
      .reverse()
      .slice(0, MinecraftVersionsService.CAP);
  }

  private async fabricGameVersions(): Promise<string[]> {
    // FabricMC lists game versions newest→oldest; keep stable releases only.
    const arr = await this.getJson<{ version: string; stable: boolean }[]>(
      'https://meta.fabricmc.net/v2/versions/game',
    );
    return arr
      .filter((g) => g.stable)
      .map((g) => g.version)
      .slice(0, MinecraftVersionsService.CAP);
  }

  private async fabricLoaderVersions(): Promise<string[]> {
    const arr = await this.getJson<{ version: string; stable: boolean }[]>(
      'https://meta.fabricmc.net/v2/versions/loader',
    );
    // Stable loaders first (newest→oldest as returned), then the rest.
    const stable = arr.filter((l) => l.stable).map((l) => l.version);
    return (stable.length ? stable : arr.map((l) => l.version)).slice(0, 40);
  }

  private async forgeMcVersions(): Promise<string[]> {
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
    return mcs
      .sort((a, b) => this.compareVersions(b, a))
      .slice(0, MinecraftVersionsService.CAP);
  }

  private async forgeBuilds(mc: string): Promise<string[]> {
    // maven-metadata lists every "<mc>-<forge>" artifact, oldest→newest.
    const xml = await this.getText(
      'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
    );
    const all = this.xmlVersions(xml);
    const prefix = `${mc}-`;
    const builds = all
      .filter((v) => v.startsWith(prefix))
      .map((v) => v.slice(prefix.length));
    // Newest first; the forge build itself ("47.2.0", "43.4.0") sorts numerically.
    return builds
      .sort((a, b) => this.compareVersions(b, a))
      .slice(0, MinecraftVersionsService.CAP);
  }

  private async neoforgeMcVersions(): Promise<string[]> {
    const xml = await this.getText(
      'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    );
    const builds = this.xmlVersions(xml).filter((b) => !b.includes('-beta'));
    const mcs = [...new Set(builds.map((b) => this.neoforgeBuildToMc(b)))];
    return mcs
      .sort((a, b) => this.compareVersions(b, a))
      .slice(0, MinecraftVersionsService.CAP);
  }

  private async neoforgeBuilds(mc: string): Promise<string[]> {
    const xml = await this.getText(
      'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml',
    );
    const builds = this.xmlVersions(xml).filter(
      (b) => !b.includes('-beta') && this.neoforgeBuildToMc(b) === mc,
    );
    return builds
      .sort((a, b) => this.compareVersions(b, a))
      .slice(0, MinecraftVersionsService.CAP);
  }

  // ---- helpers ------------------------------------------------------------

  /** Extract <version>…</version> entries from a maven-metadata.xml. */
  private xmlVersions(xml: string): string[] {
    return (xml.match(/<version>([^<]+)<\/version>/g) ?? []).map((m) =>
      m.replace(/<\/?version>/g, ''),
    );
  }

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
      MinecraftVersionsService.TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        headers: { Accept: accept, 'User-Agent': 'ReFx-Hosting' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${url} responded ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
