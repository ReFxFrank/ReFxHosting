import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
// Self-hosted country-flag SVGs (bundled at build time; no external requests).
import "flag-icons/css/flag-icons.min.css";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { EffectsModeInit } from "@/components/shared/effects-mode";
import { serializeJsonLd } from "@/lib/json-ld";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://refx.gg"
).replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND} — Game Server Hosting`, template: `%s · ${BRAND}` },
  description:
    "Buy a server slot once and switch games on demand. Console, files, backups, databases and billing in one clean panel.",
  openGraph: { siteName: BRAND, type: "website" },
};

/** Organization identity for rich results. */
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND,
  url: SITE_URL,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(ORG_JSON_LD) }}
        />
        <EffectsModeInit />
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
