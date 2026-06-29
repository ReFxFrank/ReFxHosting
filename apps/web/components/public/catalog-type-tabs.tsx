"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Mic, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPES = [
  { label: "Game Servers", href: "/games", icon: Gamepad2 },
  { label: "Voice Servers", href: "/voice", icon: Mic },
  { label: "Web Hosting", href: "/web-hosting", icon: Globe },
];

/** Lets visitors switch between the hosting product lines from any catalog page. */
export function CatalogTypeTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {TYPES.map((t) => {
        const active =
          pathname === t.href ||
          pathname.startsWith(`${t.href}/`) ||
          // The home page IS the games catalog.
          (pathname === "/" && t.href === "/games");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-white/[0.08] text-muted-foreground hover:border-white/[0.15] hover:text-foreground",
            )}
          >
            <t.icon className="size-4" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
