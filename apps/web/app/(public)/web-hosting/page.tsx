"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GameGrid, GameSearchFilter } from "@/components/public/game-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function WebHostingCatalogPage() {
  const [search, setSearch] = useState("");

  const plans = useQuery({
    queryKey: ["storefront", "web"],
    queryFn: () => api.catalog.webApps(),
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
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="refx-eyebrow">Web hosting</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Host your website</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Static sites, apps, and more — managed containers with SFTP, a file
            manager, and automatic SSL on your own domain.
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
    </div>
  );
}
