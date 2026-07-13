import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  Download,
  MemoryStick,
  Package,
  RefreshCw,
} from "lucide-react";
import {
  latestVersion,
  modpackDetail,
  ramGuidance,
} from "@/lib/modrinth";
import { SITE_URL } from "@/lib/server-api";
import { serializeJsonLd } from "@/lib/json-ld";

export const revalidate = 86_400;

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pack = await modpackDetail(slug);
  if (!pack) return { title: "Modpack hosting" };
  const title = `${pack.title} Server Hosting`;
  const description = `Host a ${pack.title} server with a one-click install: loader auto-setup, client-only mods stripped, backups and DDoS protection included.`;
  const url = `${SITE_URL}/modpacks/${pack.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — ${BRAND}`,
      description,
      url,
      type: "website",
      images: pack.icon_url ? [pack.icon_url] : undefined,
    },
  };
}

export default async function ModpackLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pack = await modpackDetail(slug);
  if (!pack) notFound();

  const ram = ramGuidance(pack);
  const mcVersion = latestVersion(pack.game_versions);
  const loaders = (pack.loaders ?? [])
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1))
    .join(" / ");

  const faq = [
    {
      q: `How do I make a ${pack.title} server?`,
      a: `Order a Minecraft server, open the Modpacks tab, search "${pack.title}" and click install. ${BRAND} sets up the right loader${loaders ? ` (${loaders})` : ""} and version, downloads the server files, and strips client-only mods automatically.`,
    },
    {
      q: `How much RAM does a ${pack.title} server need?`,
      a: `Plan for at least ${ram.min} GB; ${ram.recommended} GB is comfortable for a small group. Heavier exploration or more players push it up — plans are resizable without reinstalling.`,
    },
    {
      q: `Can I switch modpacks later?`,
      a: `Yes. Installing a different pack clean-wipes the old pack's mods and configs while preserving your worlds and backups, and your server address stays the same.`,
    },
  ];

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${pack.title} Server Hosting`,
      description: pack.description,
      image: pack.icon_url ?? undefined,
      brand: { "@type": "Brand", name: BRAND },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <Link
        href="/modpacks"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← All modpacks
      </Link>

      <div className="mt-6 flex items-start gap-5">
        {pack.icon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pack.icon_url}
            alt=""
            className="size-20 shrink-0 rounded-2xl border border-white/[0.08] object-cover"
          />
        ) : (
          <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
            <Package className="size-8 text-muted-foreground" />
          </span>
        )}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {pack.title} <span className="refx-text-gradient">Server Hosting</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{pack.description}</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="size-3" />
              {Intl.NumberFormat("en", { notation: "compact" }).format(pack.downloads)}{" "}
              downloads
            </span>
            {loaders && <span>{loaders}</span>}
            {mcVersion && <span>Minecraft {mcVersion}</span>}
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <div className="refx-card rounded-2xl p-5">
          <RefreshCw className="size-5 text-primary" />
          <h2 className="mt-2 font-semibold">One-click install</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Loader{loaders ? ` (${loaders})` : ""} and version configured
            automatically; client-only mods stripped so it boots first try.
          </p>
        </div>
        <div className="refx-card rounded-2xl p-5">
          <MemoryStick className="size-5 text-primary" />
          <h2 className="mt-2 font-semibold">{ram.recommended} GB recommended</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs from {ram.min} GB. JVM memory flags are derived from your plan —
            resize any time without reinstalling.
          </p>
        </div>
        <div className="refx-card rounded-2xl p-5">
          <Check className="size-5 text-primary" />
          <h2 className="mt-2 font-semibold">Everything included</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Backups, full file/SFTP access, crash auto-restart, DDoS protection
            and live console on every plan.
          </p>
        </div>
      </div>

      <div className="mt-10 space-y-4">
        <h2 className="text-xl font-bold">
          How to start a {pack.title} server
        </h2>
        <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
          <li>
            <Link href="/games/minecraft" className="text-primary hover:underline">
              Order a Minecraft server
            </Link>{" "}
            with at least {ram.min} GB RAM ({ram.recommended} GB recommended).
          </li>
          <li>
            Open the server&apos;s <strong>Modpacks</strong> tab and search for
            &quot;{pack.title}&quot;.
          </li>
          <li>
            Click install — grab a coffee while the files download — then start
            the server and share your address.
          </li>
        </ol>
      </div>

      <div className="mt-10 space-y-4">
        <h2 className="text-xl font-bold">Frequently asked</h2>
        {faq.map((f) => (
          <div key={f.q} className="refx-card rounded-2xl p-5">
            <h3 className="font-semibold">{f.q}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </div>

      <div className="refx-card mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl p-6 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold">Ready to play {pack.title}?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Online in minutes. {ram.recommended} GB plans fit most groups.
          </p>
        </div>
        <Link
          href="/games/minecraft"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Get your server <ArrowRight className="size-4" />
        </Link>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        {pack.title} belongs to its authors — pack data via the public Modrinth
        API. {BRAND} provides hosting and is not affiliated with the pack.
      </p>
    </div>
  );
}
