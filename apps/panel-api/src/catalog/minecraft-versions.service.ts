import { Injectable, Logger } from '@nestjs/common';

/**
 * Resolves the list of released Minecraft (Java Edition) versions from Mojang's
 * public version manifest. Used by the storefront / admin create-server flow to
 * populate a version dropdown for the Minecraft templates.
 *
 * The result is cached in-memory for ~1h. On a fetch failure we fall back to a
 * small hardcoded list so the picker degrades gracefully (it never throws).
 */
@Injectable()
export class MinecraftVersionsService {
  private readonly logger = new Logger(MinecraftVersionsService.name);

  private static readonly MANIFEST_URL =
    'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
  private static readonly TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly CAP = 60;

  /** Known-good releases, newest first — used when the manifest is unreachable. */
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

  private cache?: { versions: string[]; fetchedAt: number };

  /** Returns release versions, newest first, capped to ~60. Never throws. */
  async list(): Promise<string[]> {
    const now = Date.now();
    if (
      this.cache &&
      now - this.cache.fetchedAt < MinecraftVersionsService.TTL_MS
    ) {
      return this.cache.versions;
    }

    try {
      const res = await fetch(MinecraftVersionsService.MANIFEST_URL, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`manifest responded ${res.status}`);
      }
      const json = (await res.json()) as {
        versions?: { id: string; type: string }[];
      };
      const versions = (json.versions ?? [])
        .filter((v) => v.type === 'release')
        .map((v) => v.id)
        .slice(0, MinecraftVersionsService.CAP);

      if (versions.length === 0) {
        throw new Error('manifest contained no release versions');
      }

      this.cache = { versions, fetchedAt: now };
      return versions;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch Minecraft version manifest, using fallback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Cache the fallback briefly so we don't hammer Mojang on every request,
      // but allow a retry sooner than the full TTL.
      const fallback = MinecraftVersionsService.FALLBACK;
      this.cache = {
        versions: fallback,
        fetchedAt: now - MinecraftVersionsService.TTL_MS + 60_000, // retry in ~1min
      };
      return fallback;
    }
  }
}
