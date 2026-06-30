"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

const POPULAR: { label: string; slug: string }[] = [
  { label: "Getting started", slug: "getting-started-with-refx" },
  { label: "Switching games", slug: "switching-games-on-your-server" },
  { label: "Connect to your server", slug: "finding-and-connecting-to-your-server" },
  { label: "Billing", slug: "invoices-renewals-and-payment" },
];

/**
 * Hero search that routes into the public knowledge base. Submitting jumps to
 * /knowledge-base?q=<query> (the KB landing reads `q` to pre-filter); a few
 * popular articles sit beneath it as one-click shortcuts.
 */
export function HeroKbSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/knowledge-base?q=${encodeURIComponent(query)}` : "/knowledge-base");
  }

  return (
    <div className="refx-enter refx-enter-5 mx-auto mt-9 w-full max-w-xl">
      <form onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search our help center — setup, billing, fixes…"
          aria-label="Search the knowledge base"
          className="refx-input h-12 w-full rounded-xl pl-11 pr-24 text-sm outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="submit"
          className="refx-primary-surface absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>Popular:</span>
        {POPULAR.map((p) => (
          <Link
            key={p.slug}
            href={`/knowledge-base/${p.slug}`}
            className="rounded-full border border-white/[0.08] px-2.5 py-1 transition-colors hover:border-white/[0.2] hover:text-foreground"
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
