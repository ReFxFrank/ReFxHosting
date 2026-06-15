"use client";

import Link from "next/link";
import {
  ArrowRight,
  Cpu,
  MemoryStick,
  HardDrive,
  MapPin,
  Check,
} from "lucide-react";
import { GameImage } from "./game-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatMb } from "@/lib/utils";
import type { StorefrontGameDetail } from "@/lib/types";

/** Detail-page hero using the egg's hero image with a glassy overlay. */
export function GameDetailHero({ game }: { game: StorefrontGameDetail["game"] }) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div className="absolute inset-0">
        <GameImage src={game.heroImageUrl ?? game.cardImageUrl} alt={game.name} className="opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/80 to-[#070b12]/40" />
      </div>
      <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <Link href="/games" className="text-sm text-muted-foreground hover:text-foreground">
          ← All games
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {game.category && <Badge variant="secondary">{game.category.name}</Badge>}
          {game.tags?.slice(0, 4).map((t) => (
            <Badge key={t} variant="muted">
              {t}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          {game.name}
        </h1>
        {game.description && (
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">{game.description}</p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button size="lg" asChild>
            <Link href={`/order?game=${game.slug}`}>
              Configure server <ArrowRight className="size-4" />
            </Link>
          </Button>
          {game.startingPrice && (
            <p className="text-sm text-muted-foreground">
              from{" "}
              <span className="text-lg font-semibold text-foreground">
                {formatMoney(game.startingPrice.amountMinor, game.startingPrice.currency)}
              </span>
              /mo
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Plans + locations summary with the order CTA (config happens in /order). */
export function GameOrderSummaryPanel({ detail }: { detail: StorefrontGameDetail }) {
  const { game, plans, regions } = detail;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Plans</h2>
        <p className="text-sm text-muted-foreground">
          Pick a plan in the next step — every plan can switch games later.
        </p>
      </div>

      {plans.length === 0 ? (
        <div className="refx-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No plans are currently available for this game. Please check back soon.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const cheapest = p.prices[0];
            return (
              <div key={p.id} className="refx-card flex flex-col rounded-2xl p-5">
                <h3 className="font-semibold">{p.name}</h3>
                {p.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                )}
                <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Cpu className="size-4 text-primary" /> {p.cpuCores ?? "—"} vCPU
                  </li>
                  <li className="flex items-center gap-2">
                    <MemoryStick className="size-4 text-primary" />{" "}
                    {p.memoryMb ? formatMb(p.memoryMb) : "—"} RAM
                  </li>
                  <li className="flex items-center gap-2">
                    <HardDrive className="size-4 text-primary" />{" "}
                    {p.diskMb ? formatMb(p.diskMb) : "—"} disk
                  </li>
                </ul>
                <div className="mt-4 border-t border-white/[0.06] pt-3">
                  {cheapest ? (
                    <p>
                      <span className="text-xl font-bold">
                        {formatMoney(cheapest.amountMinor, cheapest.currency)}
                      </span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Contact us</p>
                  )}
                </div>
                <Button className="mt-4" asChild>
                  <Link href={`/order?game=${game.slug}&plan=${p.slug}`}>Select</Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {regions.length > 0 && (
        <div className="refx-card rounded-2xl p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <MapPin className="size-4 text-primary" /> Server locations
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {regions.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-3 py-1.5 text-sm text-muted-foreground"
              >
                <Check className="size-3.5 text-success" /> {r.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** "About" + long description + recommended specs block. */
export function GameAbout({ game }: { game: StorefrontGameDetail["game"] }) {
  return (
    <div className="refx-card rounded-2xl p-6">
      <h2 className="text-lg font-bold tracking-tight">About {game.name}</h2>
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
        {game.longDescription || game.description || "No description provided yet."}
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5 text-center">
        <Spec label="Rec. CPU" value={`${game.recCpuCores} vCPU`} />
        <Spec label="Rec. RAM" value={formatMb(game.recMemoryMb)} />
        <Spec label="Rec. Disk" value={formatMb(game.recDiskMb)} />
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
