"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HeroSplash, HostingFeatureCards } from "@/components/public/home-sections";
import { HomepageAlertBanner } from "@/components/public/homepage-alert-banner";
import {
  GameGrid,
  GameCategoryTabs,
  GameSearchFilter,
  ALL,
  FEATURED,
} from "@/components/public/game-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  const [category, setCategory] = useState<string>(FEATURED);
  const [search, setSearch] = useState("");

  const games = useQuery({
    queryKey: ["storefront", "games"],
    queryFn: () => api.catalog.games(),
  });
  const alerts = useQuery({
    queryKey: ["storefront", "homepage-alerts"],
    queryFn: () => api.catalog.homepageAlerts(),
  });

  const all = games.data ?? [];

  const filtered = useMemo(() => {
    let list = all;
    if (category === FEATURED) list = all.filter((g) => g.featured);
    else if (category !== ALL) list = all.filter((g) => g.category?.slug === category);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q) ||
          g.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [all, category, search]);

  // If nothing is flagged featured, default the "Popular" tab to all games.
  const display =
    category === FEATURED && filtered.length === 0 && !search ? all : filtered;

  return (
    <>
      {alerts.data && alerts.data.length > 0 && (
        <HomepageAlertBanner alerts={alerts.data} />
      )}

      <HeroSplash />

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="refx-eyebrow">Game catalog</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Choose your game</h2>
          </div>
          <GameSearchFilter value={search} onChange={setSearch} />
        </div>

        <div className="mb-6">
          <GameCategoryTabs games={all} active={category} onChange={setCategory} />
        </div>

        {games.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : (
          <GameGrid games={display} />
        )}
      </section>

      <HostingFeatureCards />
    </>
  );
}
