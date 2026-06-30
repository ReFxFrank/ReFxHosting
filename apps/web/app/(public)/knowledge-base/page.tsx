"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, BookOpen, ArrowRight, LifeBuoy } from "lucide-react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { KbArticle } from "@/lib/types";

// Preferred display order for categories; anything else falls to the end.
const CATEGORY_ORDER = [
  "Getting Started",
  "Using the Panel",
  "Games",
  "Voice Servers",
  "Web Hosting",
  "Plans & Billing",
  "Account & Security",
  "Troubleshooting",
];

/** First line of the body (the intro sentence), stripped of markdown, as an excerpt. */
function excerpt(body: string): string {
  const first = body.split("\n").find((l) => l.trim()) ?? "";
  return first
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/, "")
    .trim();
}

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState("");

  // Seed the search from a ?q= param (e.g. arriving from the homepage hero
  // search). Read from the URL directly so this static page stays static.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearch(q);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["kb", "all"],
    queryFn: () => api.support.kb(),
  });

  const articles = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        (a.category ?? "").toLowerCase().includes(q),
    );
  }, [articles, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, KbArticle[]>();
    for (const a of filtered) {
      const cat = a.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(a);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a[0]);
      const bi = CATEGORY_ORDER.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [filtered]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <p className="refx-eyebrow mx-auto inline-flex items-center gap-2">
          <BookOpen className="size-4" /> Knowledge base
        </p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          How can we help?
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground">
          Guides for ordering, using your control panel, switching games, voice and
          web hosting, billing, and fixing common issues.
        </p>
        <div className="relative mx-auto mt-7 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="refx-input h-12 w-full rounded-xl pl-10 pr-4 text-sm outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      <div className="mt-12">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="refx-card rounded-2xl p-10 text-center">
            <BookOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">No articles found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search ? "Try a different search term." : "Check back soon."}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(([category, items]) => (
              <section key={category}>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((a) => (
                    <Link
                      key={a.id}
                      href={`/knowledge-base/${a.slug}`}
                      className="refx-card group flex flex-col rounded-2xl p-5 transition-colors hover:border-primary/40"
                    >
                      <p className="flex items-center justify-between gap-2 font-semibold">
                        <span className="leading-snug">{a.title}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                        {excerpt(a.body)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="mt-14 flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <LifeBuoy className="size-6 text-primary" />
          <div>
            <p className="font-semibold">Can&apos;t find an answer?</p>
            <p className="text-sm text-muted-foreground">
              Our team is happy to help — open a ticket from your dashboard.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/support">Contact support</Link>
        </Button>
      </div>
    </div>
  );
}
