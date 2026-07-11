import Link from "next/link";
import { ArrowRight, Check, Gamepad2 } from "lucide-react";
import type { GameContent } from "@/lib/game-content";

/**
 * Editorial band rendered below the interactive game detail: the unique,
 * crawlable substance of each /games/[slug] page (specs, setup, mods, FAQ).
 * Server component — content comes from apps/web/data/games at build time.
 */

interface RelatedGame {
  slug: string;
  name: string;
}

export function GameEditorial({
  content,
  gameName,
  related,
}: {
  content: GameContent;
  gameName: string;
  related: RelatedGame[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-14 px-4 pb-20 pt-4 sm:px-6">
      {/* Intro */}
      <section className="max-w-3xl">
        <p className="refx-eyebrow mb-3">About {gameName} hosting</p>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {content.tagline}
        </h2>
        <p className="mt-4 text-muted-foreground">{content.heroCopy}</p>
      </section>

      {/* Why dedicated */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Why a dedicated {gameName} server
        </h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {content.whyDedicated.map((point) => (
            <li key={point} className="refx-card flex items-start gap-3 rounded-2xl p-4">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              <span className="text-sm text-muted-foreground">{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Recommended specs */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          How much server do you need
        </h2>
        <div className="refx-card mt-5 overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-4 font-semibold">Players</th>
                <th className="px-5 py-4 font-semibold">RAM</th>
                <th className="px-5 py-4 font-semibold">CPU</th>
                <th className="px-5 py-4 font-semibold">Storage</th>
              </tr>
            </thead>
            <tbody>
              {content.recommendedSpecs.map((tier) => (
                <tr key={tier.players} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-5 py-4 font-medium">{tier.players}</td>
                  <td className="px-5 py-4 text-muted-foreground">{tier.ram}</td>
                  <td className="px-5 py-4 text-muted-foreground">{tier.cpu}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {tier.storage}
                    {tier.note ? (
                      <span className="mt-1 block text-xs text-muted-foreground/80">
                        {tier.note}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          RAM is dedicated (never oversold) and CPU can burst above its
          fair-share weight, so these are honest working numbers — and plans
          resize without reinstalling if you outgrow them.
        </p>
      </section>

      {/* Setup steps */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          From order to online
        </h2>
        <ol className="mt-5 space-y-3">
          {content.setupSteps.map((step, i) => (
            <li key={i} className="refx-card flex items-start gap-4 rounded-2xl p-4">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-sm font-semibold">
                {i + 1}
              </span>
              <span className="pt-0.5 text-sm text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Mod support */}
      {content.modSupport ? (
        <section>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Mods and customization
          </h2>
          <p className="mt-4 max-w-3xl text-muted-foreground">{content.modSupport}</p>
        </section>
      ) : null}

      {/* FAQ */}
      <section>
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          {gameName} hosting questions
        </h2>
        <div className="mt-5 space-y-4">
          {content.faq.map((f) => (
            <div key={f.q} className="refx-card rounded-2xl p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Related games */}
      {related.length > 0 ? (
        <section>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Communities like yours also host
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            One server can play them all — switching games keeps your address,
            backups and billing.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {related.map((g) => (
              <Link
                key={g.slug}
                href={`/games/${g.slug}`}
                className="refx-card group flex items-center gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.03]"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
                  <Gamepad2 className="size-5 text-muted-foreground" />
                </span>
                <span className="font-medium">{g.name}</span>
                <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
