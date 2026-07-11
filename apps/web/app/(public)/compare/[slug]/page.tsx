import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import {
  COMPARE_INDEXABLE,
  COMPARE_REVIEWED,
  COMPETITOR_MAP,
  COMPETITORS,
} from "@/data/compare";
import { SITE_URL } from "@/lib/server-api";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = COMPETITOR_MAP.get(slug);
  if (!c) return { title: "Comparison not found" };
  const title = `${BRAND} vs ${c.name}`;
  const description = `An honest comparison of ${BRAND} and ${c.name} for game server hosting: game switching, modpacks, backups, panel features — and when ${c.name} is the better fit.`;
  const url = `${SITE_URL}/compare/${c.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: COMPARE_INDEXABLE ? undefined : { index: false, follow: true },
    openGraph: { title: `${title} — honest comparison`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = COMPETITOR_MAP.get(slug);
  if (!c) notFound();

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: c.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Compare", item: `${SITE_URL}/compare` },
        {
          "@type": "ListItem",
          position: 2,
          name: `${BRAND} vs ${c.name}`,
          item: `${SITE_URL}/compare/${c.slug}`,
        },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/compare"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All comparisons
      </Link>

      <p className="refx-eyebrow mb-3 mt-6">Honest comparison</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
        {BRAND} <span className="refx-text-gradient">vs</span> {c.name}
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">{c.intro}</p>

      {/* Comparison table */}
      <div className="refx-card mt-10 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-4 font-semibold">Feature</th>
              <th className="px-5 py-4 font-semibold text-foreground">{BRAND}</th>
              <th className="px-5 py-4 font-semibold">{c.name}</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row) => (
              <tr
                key={row.feature}
                className="border-b border-white/[0.04] last:border-0"
              >
                <td className="px-5 py-4 font-medium">{row.feature}</td>
                <td className="px-5 py-4 text-muted-foreground">
                  <span className="flex items-start gap-2">
                    {row.refx.startsWith("Yes") || row.refx.startsWith("All") ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    ) : null}
                    <span className="text-foreground/90">{row.refx}</span>
                  </span>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{row.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {c.name} details reflect their public marketing at a high level, last
        reviewed {COMPARE_REVIEWED}; features and plans change, so verify
        specifics on their site. See something wrong?{" "}
        <Link href="/support" className="underline hover:text-foreground">
          Tell us
        </Link>
        .
      </p>

      {/* Where ReFx is different */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Where {BRAND} is different
        </h2>
        <div className="mt-4 space-y-4">
          {c.different.map((p, i) => (
            <p key={i} className="text-muted-foreground">
              {p}
            </p>
          ))}
        </div>
      </section>

      {/* Honest flip side */}
      <section className="refx-card mt-10 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">
          When {c.name} might fit better
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.whenThem}</p>
      </section>

      {/* FAQ */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
          Common questions
        </h2>
        <div className="mt-5 space-y-4">
          {c.faq.map((f) => (
            <div key={f.q} className="refx-card rounded-2xl p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="refx-card mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Try the difference yourself</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A server that keeps its address, backups and billing through every
            game your community plays.
          </p>
        </div>
        <Link
          href="/games"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Browse games <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
