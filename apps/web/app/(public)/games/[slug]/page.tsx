import type { Metadata } from "next";
import { GameDetailClient } from "./game-detail-client";
import { GameEditorial } from "@/components/public/game-editorial";
import { getGameContent } from "@/data/games";
import { SITE_URL, serverGet } from "@/lib/server-api";
import { serializeJsonLd } from "@/lib/json-ld";

/**
 * Server shell for the game landing page: crawlable metadata + Product
 * JSON-LD (name, description, tier price range) around the interactive
 * client detail, followed by the per-game editorial band (unique copy,
 * specs, setup steps, FAQ) with HowTo + FAQPage JSON-LD.
 */

interface GameDetailSeo {
  game: {
    slug: string;
    name: string;
    description?: string | null;
    imageUrl?: string | null;
  };
  configurations?: {
    name: string;
    price?: { amountMinor: number; currency: string } | null;
  }[];
}

interface GameRef {
  slug: string;
  name: string;
}

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const detail = await serverGet<GameDetailSeo>(`/catalog/games/${slug}`, 600);
  if (!detail?.game) return { title: "Game hosting" };
  const g = detail.game;
  const content = getGameContent(g.slug);
  const title = `${g.name} Server Hosting`;
  const description =
    content?.heroCopy.slice(0, 155) ??
    g.description?.slice(0, 155) ??
    `Rent a ${g.name} server with instant setup, full file access, backups and DDoS protection.`;
  const url = `${SITE_URL}/games/${g.slug}`;
  return {
    title,
    description,
    keywords: content?.searchTerms,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${BRAND}`,
      description,
      url,
      type: "website",
      images: g.imageUrl ? [g.imageUrl] : undefined,
    },
  };
}

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await serverGet<GameDetailSeo>(`/catalog/games/${slug}`, 600);
  const content = detail?.game ? getGameContent(detail.game.slug) : undefined;

  const prices = (detail?.configurations ?? [])
    .map((c) => c.price)
    .filter((p): p is { amountMinor: number; currency: string } => !!p);
  const jsonLd: object[] = [];
  if (detail?.game) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${detail.game.name} Server Hosting`,
      description: detail.game.description ?? undefined,
      image: detail.game.imageUrl ?? undefined,
      brand: { "@type": "Brand", name: BRAND },
      offers:
        prices.length > 0
          ? {
              "@type": "AggregateOffer",
              priceCurrency: prices[0].currency,
              lowPrice: (
                Math.min(...prices.map((p) => p.amountMinor)) / 100
              ).toFixed(2),
              highPrice: (
                Math.max(...prices.map((p) => p.amountMinor)) / 100
              ).toFixed(2),
              offerCount: prices.length,
            }
          : undefined,
    });
  }
  if (detail?.game && content) {
    jsonLd.push(
      {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: `How to set up a ${detail.game.name} server`,
        step: content.setupSteps.map((step, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          text: step,
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: content.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    );
  }

  // Display names for the related-games grid (falls back to slug-derived).
  let related: GameRef[] = [];
  if (content && content.relatedGames.length > 0) {
    const all = (await serverGet<GameRef[]>("/catalog/games", 900)) ?? [];
    const names = new Map(all.map((g) => [g.slug, g.name]));
    related = content.relatedGames.map((s) => ({
      slug: s,
      name:
        names.get(s) ??
        s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }

  return (
    <>
      {jsonLd.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      )}
      <GameDetailClient />
      {detail?.game && content ? (
        <GameEditorial
          content={content}
          gameName={detail.game.name}
          related={related}
        />
      ) : null}
    </>
  );
}
