/**
 * Server-side Modrinth catalog access for the programmatic modpack landing
 * pages (/modpacks). Public API, no key; Modrinth asks for a descriptive
 * User-Agent. Everything is cached via Next's data cache (24h) — these pages
 * are marketing surface, not live data — and fails soft to keep pages up.
 */

const MODRINTH = "https://api.modrinth.com/v2";
const UA = "refx-hosting-web/1.0 (https://refx.gg)";
/** How many packs the index + sitemap carry (detail pages render for ANY slug). */
export const MODPACK_INDEX_SIZE = 96;

export interface ModrinthPack {
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  /** Supported Minecraft versions, oldest→newest. */
  versions?: string[];
}

async function modrinthGet<T>(path: string, revalidate = 86_400): Promise<T | null> {
  try {
    const res = await fetch(`${MODRINTH}${path}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Top server-installable modpacks by all-time downloads. */
export async function topModpacks(): Promise<ModrinthPack[]> {
  const facets = encodeURIComponent(
    JSON.stringify([["project_type:modpack"], ["server_side!=unsupported"]]),
  );
  const data = await modrinthGet<{ hits: (ModrinthPack & { project_id: string })[] }>(
    `/search?facets=${facets}&index=downloads&limit=${MODPACK_INDEX_SIZE}`,
  );
  return data?.hits ?? [];
}

export interface ModrinthProject extends ModrinthPack {
  body: string;
  game_versions: string[];
  loaders: string[];
  updated: string;
}

/** Full project detail for one pack (null = unknown slug / API down). */
export function modpackDetail(slug: string): Promise<ModrinthProject | null> {
  return modrinthGet<ModrinthProject>(`/project/${encodeURIComponent(slug)}`);
}

/**
 * Honest RAM guidance from the pack's loader + content signals. Kitchen-sink
 * and tech-heavy packs need more headroom; light/optimization packs less.
 */
export function ramGuidance(pack: {
  categories?: string[];
  loaders?: string[];
}): { min: number; recommended: number } {
  const cats = new Set(pack.categories ?? []);
  const heavy =
    cats.has("kitchen-sink") ||
    cats.has("technology") ||
    cats.has("magic") ||
    cats.has("challenging");
  const light = cats.has("optimization") || cats.has("lightweight");
  if (heavy) return { min: 6, recommended: 10 };
  if (light) return { min: 3, recommended: 4 };
  return { min: 4, recommended: 6 };
}

/** Latest supported Minecraft version, when the API provides it. */
export function latestVersion(versions?: string[]): string | null {
  if (!versions?.length) return null;
  return versions[versions.length - 1] ?? null;
}
