import type { Metadata } from "next";
import { GameDetailClient } from "./game-detail-client";
import { SITE_URL, serverGet } from "@/lib/server-api";

/**
 * Server shell for the game landing page: crawlable metadata + Product
 * JSON-LD (name, description, tier price range) around the interactive
 * client detail. The client component keeps its own fetching/skeletons.
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
  const title = `${g.name} Server Hosting`;
  const description =
    g.description?.slice(0, 155) ??
    `Rent a ${g.name} server with instant setup, full file access, backups and DDoS protection.`;
  const url = `${SITE_URL}/games/${g.slug}`;
  return {
    title,
    description,
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

  const prices = (detail?.configurations ?? [])
    .map((c) => c.price)
    .filter((p): p is { amountMinor: number; currency: string } => !!p);
  const jsonLd = detail?.game
    ? {
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
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <GameDetailClient />
    </>
  );
}
