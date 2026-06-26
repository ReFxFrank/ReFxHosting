import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
// Self-hosted country-flag SVGs (bundled at build time; no external requests).
import "flag-icons/css/flag-icons.min.css";
import { Providers } from "@/components/providers";
import { CookieConsent } from "@/components/shared/cookie-consent";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export const metadata: Metadata = {
  title: { default: `${BRAND} — Game Server Hosting`, template: `%s · ${BRAND}` },
  description:
    "Buy a server slot once and switch games on demand. Console, files, backups, databases and billing in one clean panel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
