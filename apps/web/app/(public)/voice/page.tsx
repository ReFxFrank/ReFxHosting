"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GameGrid, GameSearchFilter } from "@/components/public/game-grid";
import { CatalogTypeTabs } from "@/components/public/catalog-type-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function VoiceCatalogPage() {
  const [search, setSearch] = useState("");

  const voice = useQuery({
    queryKey: ["storefront", "voice"],
    queryFn: () => api.catalog.voiceApps(),
  });

  const all = voice.data ?? [];
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
            <p className="refx-eyebrow refx-enter refx-enter-1">
              Voice servers
            </p>
            <h1 className="refx-enter refx-enter-2 mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Crystal-clear{" "}
              <span className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent">
                voice hosting
              </span>
            </h1>
            <p className="refx-enter refx-enter-3 mt-1 text-sm text-muted-foreground">
              TeamSpeak and more — low-latency voice for your community, billed
              by the slot.
            </p>
          </div>
          <GameSearchFilter value={search} onChange={setSearch} />
        </div>

        {voice.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <GameGrid
            games={filtered}
            basePath="/voice"
            emptyLabel="No voice servers available yet — check back soon."
          />
        )}
      </div>
    </div>
  );
}
