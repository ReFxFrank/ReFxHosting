"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GameGrid, GameSearchFilter } from "@/components/public/game-grid";
import { CatalogTypeTabs } from "@/components/public/catalog-type-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";

export default function WebHostingCatalogPage() {
  const [search, setSearch] = useState("");

  const plans = useQuery({
    queryKey: ["storefront", "web"],
    queryFn: () => api.catalog.webApps(),
  });
  const bots = useQuery({
    queryKey: ["storefront", "bots"],
    queryFn: () => api.catalog.botApps(),
  });

  const all = plans.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description?.toLowerCase().includes(q) ||
        g.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [all, search]);

  return (
    <div className="relative overflow-hidden">
      {/* Static hero glow — the animated aurora stays homepage-exclusive. */}
      <div
        aria-hidden
        className="refx-enter-glow pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 50% at 50% 0%, rgba(0,114,255,0.13), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <CatalogTypeTabs />
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="refx-eyebrow refx-enter refx-enter-1">Web hosting</p>
            <h1 className="refx-enter refx-enter-2 mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Host{" "}
              <span className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent">
                your website
              </span>
            </h1>
            <p className="refx-enter refx-enter-3 mt-1 text-sm text-muted-foreground">
              Static sites, apps, and more — managed containers with SFTP, a
              file manager, and automatic SSL on your own domain.
            </p>
          </div>
          <GameSearchFilter value={search} onChange={setSearch} />
        </div>

        {plans.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <GameGrid
            games={filtered}
            basePath="/web-hosting"
            emptyLabel="No web hosting plans available yet — check back soon."
          />
        )}

        {(bots.isLoading || (bots.data?.length ?? 0) > 0) && (
          <Reveal>
            <section className="mt-14">
              <div className="mb-6">
                <p className="refx-eyebrow">Bot hosting</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight">
                  Host your{" "}
                  <span className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent">
                    Discord bot
                  </span>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Run your bot 24/7 — pick a runtime (Node.js or Python), upload
                  your code via SFTP or the file manager, set your token, and
                  go.
                </p>
              </div>
              {bots.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-72 rounded-2xl" />
                  ))}
                </div>
              ) : (
                <GameGrid games={bots.data ?? []} basePath="/bots" />
              )}
            </section>
          </Reveal>
        )}
      </div>
    </div>
  );
}
