import type { Metadata } from "next";
import { SITE_URL } from "@/lib/server-api";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

/**
 * Centralized page metadata: unique title (root layout appends "· BRAND"),
 * 140–160-char description, canonical, OpenGraph + Twitter card. Every
 * marketing page declares metadata through this so nothing ships bare.
 */
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
}): Metadata {
  const url = `${SITE_URL}${opts.path}`;
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${opts.title} — ${BRAND}`,
      description: opts.description,
      url,
      type: "website",
      images: opts.ogImage ? [opts.ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${opts.title} — ${BRAND}`,
      description: opts.description,
    },
  };
}
