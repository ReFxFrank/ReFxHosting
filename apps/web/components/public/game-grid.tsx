"use client";

import Link from "next/link";
import { Search, ArrowRight, Cpu, MemoryStick } from "lucide-react";
import { GameImage } from "./game-image";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatMoney, formatMb } from "@/lib/utils";
import type { StorefrontGame } from "@/lib/types";

export const ALL = "__all__";
export const FEATURED = "__featured__";

/** A single game card linking to its detail/order page. */
export function GameCard({ game }: { game: StorefrontGame }) {
  return (
    <Link
      href={`/games/${game.slug}`}
      className="group refx-card relative flex flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:refx-glow"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <GameImage
          src={game.cardImageUrl}
          alt={game.name}
          className="transition-transform duration-300 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-transparent to-transparent" />
        {game.featured && (
          <Badge className="absolute left-3 top-3" variant="secondary">
            Featured
          </Badge>
        )}
        {game.category && (
          <Badge className="absolute right-3 top-3" variant="muted">
            {game.category.name}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-semibold tracking-tight">{game.name}</h3>
          {game.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{game.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Cpu className="size-3.5" /> {game.recCpuCores} vCPU
          </span>
          <span className="inline-flex items-center gap-1">
            <MemoryStick className="size-3.5" /> {formatMb(game.recMemoryMb)}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3">
          <div className="text-sm">
            {game.startingPrice ? (
              <>
                <span className="text-muted-foreground">from </span>
                <span className="font-semibold text-foreground">
                  {formatMoney(game.startingPrice.amountMinor, game.startingPrice.currency)}
                </span>
                <span className="text-muted-foreground">/mo</span>
              </>
            ) : (
              <span className="text-muted-foreground">Contact us</span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
            Configure <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function GameGrid({ games }: { games: StorefrontGame[] }) {
  if (games.length === 0) {
    return (
      <div className="refx-card rounded-2xl p-12 text-center">
        <p className="text-sm text-muted-foreground">No games match your filters yet.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {games.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
    </div>
  );
}

/** Category tabs derived from the live games (plus Popular + All). */
export function GameCategoryTabs({
  games,
  active,
  onChange,
}: {
  games: StorefrontGame[];
  active: string;
  onChange: (v: string) => void;
}) {
  const cats = new Map<string, string>();
  for (const g of games) if (g.category) cats.set(g.category.slug, g.category.name);

  const tabs = [
    { value: FEATURED, label: "Popular" },
    { value: ALL, label: "All games" },
    ...[...cats.entries()].map(([slug, name]) => ({ value: slug, label: name })),
  ];

  return (
    // Single scrollable row on mobile (bleeds to the screen edges); wraps on ≥sm.
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors",
            active === t.value
              ? "refx-primary-surface border-transparent text-white"
              : "border-white/[0.08] text-muted-foreground hover:border-white/20 hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function GameSearchFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search games…"
        className="pl-9"
      />
    </div>
  );
}
