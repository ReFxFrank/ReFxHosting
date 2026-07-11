import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Scale } from "lucide-react";
import { COMPARE_INDEXABLE, COMPETITORS } from "@/data/compare";
import { pageMetadata } from "@/lib/seo";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Compare game server hosts",
    description:
      "Honest, qualitative comparisons of ReFx Hosting against Apex, Shockbyte, BisectHosting, G-Portal, Nitrado and PebbleHost — what differs, and when a competitor fits better.",
    path: "/compare",
  }),
  robots: COMPARE_INDEXABLE ? undefined : { index: false, follow: true },
};

export default function CompareHubPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
      <div className="max-w-2xl">
        <p className="refx-eyebrow mb-3">Comparisons</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
          How {BRAND} <span className="refx-text-gradient">compares</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Feature-by-feature looks at {BRAND} next to the hosts people usually
          shortlist. We keep these honest: our side lists only what the
          platform actually does today, the competitor side sticks to what
          they publicly advertise, and every page includes when the other
          host might be the better pick.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMPETITORS.map((c) => (
          <Link
            key={c.slug}
            href={`/compare/${c.slug}`}
            className="refx-card group flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:bg-white/[0.03]"
          >
            <span className="flex size-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
              <Scale className="size-5 text-muted-foreground" />
            </span>
            <h2 className="font-semibold">
              {BRAND} vs {c.name}
            </h2>
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {c.intro}
            </p>
            <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              Read the comparison <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-10 text-xs text-muted-foreground">
        Competitor details reflect each company&apos;s own public marketing at
        a high level and can change at any time — always verify current plans
        and features on their site. Spotted something outdated?{" "}
        <Link href="/support" className="underline hover:text-foreground">
          Tell us
        </Link>{" "}
        and we&apos;ll fix it.
      </p>
    </div>
  );
}
