import Link from "next/link";
import type { Metadata } from "next";
import { Package, Download, ArrowRight } from "lucide-react";
import { topModpacks } from "@/lib/modrinth";
import { SITE_URL } from "@/lib/server-api";

export const revalidate = 86_400;

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export const metadata: Metadata = {
  title: "Modpack Server Hosting — one-click installs",
  description:
    "Host any CurseForge or Modrinth modpack with one-click installs: loader auto-setup, client-only mods stripped, sane memory flags. Browse popular packs.",
  alternates: { canonical: `${SITE_URL}/modpacks` },
};

function fmtDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export default async function ModpacksIndexPage() {
  const packs = await topModpacks();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
      <div className="max-w-2xl">
        <p className="refx-eyebrow mb-3">Minecraft modpack hosting</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          Run any modpack. <span className="refx-text-gradient">One click.</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Every {BRAND} Minecraft server installs CurseForge and Modrinth packs
          from the panel: the right loader and version are set up automatically,
          client-only mods are stripped so the server actually boots, and memory
          flags are derived from your plan — not the pack author&apos;s laptop.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/games/minecraft"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            See Minecraft plans <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/knowledge-base/install-curseforge-modrinth-modpack-on-server"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            How installs work
          </Link>
        </div>
      </div>

      {packs.length > 0 ? (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <Link
              key={pack.slug}
              href={`/modpacks/${pack.slug}`}
              className="refx-card group flex gap-4 rounded-2xl p-4 transition-colors hover:bg-white/[0.03]"
            >
              {pack.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pack.icon_url}
                  alt=""
                  loading="lazy"
                  className="size-14 shrink-0 rounded-xl border border-white/[0.06] object-cover"
                />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                  <Package className="size-6 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-semibold group-hover:text-foreground">
                  {pack.title}
                </h2>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {pack.description}
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Download className="size-3" /> {fmtDownloads(pack.downloads)}{" "}
                  downloads
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-12 text-sm text-muted-foreground">
          Pack list is temporarily unavailable — every pack still installs from
          the panel&apos;s Modpacks tab.
        </p>
      )}

      <p className="mt-10 text-xs text-muted-foreground">
        Pack data via the public Modrinth API. All trademarks belong to their
        pack authors; {BRAND} is not affiliated with individual packs.
      </p>
    </div>
  );
}
