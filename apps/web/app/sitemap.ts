import type { MetadataRoute } from "next";
import { SITE_URL, serverGet } from "@/lib/server-api";
import { topModpacks } from "@/lib/modrinth";
import { COMPARE_INDEXABLE, COMPETITORS } from "@/data/compare";

/**
 * Dynamic sitemap: the static marketing routes plus every published game page
 * and knowledge-base article. Regenerated at most every 15 minutes.
 */
export const revalidate = 900;

interface GameRef {
  slug: string;
}
interface KbRef {
  slug: string;
  updatedAt?: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/games",
    "/modpacks",
    "/order",
    "/knowledge-base",
    "/voice",
    "/web-hosting",
    "/bots",
    "/status",
    "/team",
    "/terms",
    "/privacy",
    "/refunds",
    "/acceptable-use",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/games" || path === "/order" ? 0.9 : 0.5,
  }));

  const [games, articles, packs] = await Promise.all([
    serverGet<GameRef[]>("/catalog/games", 900),
    serverGet<KbRef[]>("/support/kb", 900),
    topModpacks(),
  ]);

  const gameRoutes: MetadataRoute.Sitemap = (games ?? []).map((g) => ({
    url: `${SITE_URL}/games/${g.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const kbRoutes: MetadataRoute.Sitemap = (articles ?? []).map((a) => ({
    url: `${SITE_URL}/knowledge-base/${a.slug}`,
    lastModified: a.updatedAt ? new Date(a.updatedAt) : undefined,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const packRoutes: MetadataRoute.Sitemap = (packs ?? []).map((p) => ({
    url: `${SITE_URL}/modpacks/${p.slug}`,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Comparison pages are noindex until reviewed; keep them out of the sitemap
  // until NEXT_PUBLIC_INDEX_COMPARE is flipped.
  const compareRoutes: MetadataRoute.Sitemap = COMPARE_INDEXABLE
    ? [
        { url: `${SITE_URL}/compare`, changeFrequency: "monthly" as const, priority: 0.6 },
        ...COMPETITORS.map((c) => ({
          url: `${SITE_URL}/compare/${c.slug}`,
          changeFrequency: "monthly" as const,
          priority: 0.6,
        })),
      ]
    : [];

  return [...staticRoutes, ...gameRoutes, ...kbRoutes, ...packRoutes, ...compareRoutes];
}
