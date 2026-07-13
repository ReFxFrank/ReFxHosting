import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/server-api";
import { serializeJsonLd } from "@/lib/json-ld";

/**
 * Server-rendered shell shared by the free-tool pages: breadcrumb, H1,
 * explainer prose, the interactive tool (client child), FAQ with FAQPage +
 * BreadcrumbList JSON-LD, and a hosting CTA. The tools exist to earn organic
 * search traffic — the copy around each tool is the crawlable substance.
 */

export interface ToolFaqItem {
  q: string;
  a: string;
}

export function ToolShell({
  path,
  title,
  tagline,
  intro,
  faq,
  children,
  ctaTitle,
  ctaBody,
  ctaHref,
  ctaLabel,
}: {
  /** Route path, e.g. "/tools/aikars-flags" (for breadcrumb JSON-LD). */
  path: string;
  title: string;
  tagline: string;
  intro: string[];
  faq: ToolFaqItem[];
  children: React.ReactNode;
  ctaTitle: string;
  ctaBody: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Free tools", item: `${SITE_URL}/tools` },
        { "@type": "ListItem", position: 2, name: title, item: `${SITE_URL}${path}` },
      ],
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <Link
        href="/tools"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All tools
      </Link>

      <p className="refx-eyebrow mb-3 mt-6">Free tool</p>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{tagline}</p>

      <div className="mt-8">{children}</div>

      <div className="mt-10 space-y-4">
        {intro.map((p, i) => (
          <p key={i} className="text-muted-foreground">
            {p}
          </p>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">Common questions</h2>
        <div className="mt-5 space-y-4">
          {faq.map((f) => (
            <div key={f.q} className="refx-card rounded-2xl p-5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="refx-card mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">{ctaTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{ctaBody}</p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {ctaLabel} <ArrowRight className="size-4" />
        </Link>
      </section>
    </div>
  );
}
