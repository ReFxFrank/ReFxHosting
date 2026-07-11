/**
 * Server-side fetch against panel-api for RSC/metadata/sitemap use — crawlers
 * must see real HTML, so SEO-relevant pages fetch here instead of react-query.
 * Cached via Next's data cache (default 5 min) and always fail-soft: SEO
 * plumbing must never take a page down.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

/** Absolute site origin for canonical URLs / OG / sitemap entries. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://refx.gg"
).replace(/\/$/, "");

export async function serverGet<T>(
  path: string,
  revalidateSeconds = 300,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      next: { revalidate: revalidateSeconds },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: boolean; data?: T } | T;
    // panel-api wraps responses in { success, data }.
    if (body && typeof body === "object" && "data" in (body as object)) {
      return (body as { data?: T }).data ?? null;
    }
    return body as T;
  } catch {
    return null;
  }
}
