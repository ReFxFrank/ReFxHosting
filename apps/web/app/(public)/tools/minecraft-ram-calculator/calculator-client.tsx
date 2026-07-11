"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Honest working numbers, mirroring the sizing guidance in the knowledge
 * base: a base heap per server flavor plus a per-player factor, rounded up
 * to common plan sizes. Deliberately conservative — the classic mistake is
 * buying 2 GB for a 40-mod pack.
 */

const FLAVORS = {
  vanilla: { label: "Vanilla / Snapshot", base: 2, perPlayer: 0.05 },
  paper: { label: "Paper / Spigot with plugins", base: 3, perPlayer: 0.06 },
  light: { label: "Light modpack (up to ~100 mods)", base: 5, perPlayer: 0.1 },
  medium: { label: "Medium modpack (100–250 mods)", base: 7, perPlayer: 0.12 },
  heavy: { label: "Heavy modpack (ATM10, RAD, 250+ mods)", base: 10, perPlayer: 0.15 },
} as const;

type FlavorKey = keyof typeof FLAVORS;

const PLAN_SIZES = [2, 4, 6, 8, 10, 12, 16, 20, 24, 32];

export function CalculatorClient() {
  const [flavor, setFlavor] = useState<FlavorKey>("paper");
  const [players, setPlayers] = useState(10);

  const f = FLAVORS[flavor];
  const raw = f.base + Math.max(0, players - 5) * f.perPlayer;
  const recommended = PLAN_SIZES.find((s) => s >= raw) ?? PLAN_SIZES[PLAN_SIZES.length - 1];
  const comfortable =
    PLAN_SIZES.find((s) => s >= recommended + 2) ?? PLAN_SIZES[PLAN_SIZES.length - 1];

  return (
    <div className="refx-card rounded-2xl p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Server type</label>
          <Select value={flavor} onValueChange={(v) => setFlavor(v as FlavorKey)}>
            <SelectTrigger aria-label="Server type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FLAVORS).map(([key, v]) => (
                <SelectItem key={key} value={key}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Concurrent players</label>
          <Input
            type="number"
            min={1}
            max={200}
            value={players}
            onChange={(e) =>
              setPlayers(Math.max(1, Math.min(200, Number(e.target.value) || 1)))
            }
            aria-label="Concurrent players"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Recommended
          </p>
          <p className="mt-1 text-3xl font-bold">
            {recommended} GB <span className="text-base font-medium text-muted-foreground">RAM</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {f.label}, ~{players} player{players === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Comfortable headroom
          </p>
          <p className="mt-1 text-3xl font-bold">
            {comfortable} GB <span className="text-base font-medium text-muted-foreground">RAM</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            For big builds, exploration bursts and chunk pregen
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          Plans resize without reinstalling — start at the recommendation and
          scale if TPS says so.
        </p>
        <Link
          href="/games/minecraft"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          See {recommended} GB plans <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
