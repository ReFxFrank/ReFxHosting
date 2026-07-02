"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { LogoWordmark } from "@/components/brand/logo";
import { AppStoreBadge } from "@/components/public/app-store-badge";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

const NAV = [
  { label: "Games", href: "/games" },
  { label: "Voice", href: "/voice" },
  { label: "Web Hosting", href: "/web-hosting" },
  { label: "Features", href: "/#features" },
  { label: "Help", href: "/knowledge-base" },
  { label: "Team", href: "/team" },
  { label: "Status", href: "/status" },
];

/**
 * Chrome for the unauthenticated public storefront — sticky glass header with
 * brand + nav + auth-aware CTAs, and a footer. Renders for everyone; logged-in
 * visitors see a "Client Area" shortcut into the panel instead of Login.
 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const authed = status === "authenticated";
  // Mobile hamburger state — the desktop nav is hidden below `md`, so phones
  // need this menu to reach Games/Voice/Web Hosting/Help/Team/Status at all.
  // Every menu link closes it via onClick, so no navigation effect is needed.
  const [menuOpen, setMenuOpen] = useState(false);

  // Resolve auth state once so the header can show Client Area vs Login.
  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="refx-beam sticky top-0 z-40 border-b border-white/[0.06] bg-[rgba(7,11,18,0.72)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            aria-label={`${BRAND} — home`}
            className="relative z-10 inline-flex items-center"
          >
            <LogoWordmark height={26} />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {authed ? (
              <Button size="sm" asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="size-4" /> Client Area
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  className="hidden sm:inline-flex"
                >
                  <Link href="/login">Login</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/games">
                    Start hosting <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile nav — stacked links under the sticky header. */}
        {menuOpen && (
          <nav className="border-t border-white/[0.06] px-4 pb-4 pt-2 md:hidden">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
            {!authed && (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="mt-1 block rounded-lg border border-white/[0.08] px-3 py-2.5 text-center text-sm font-medium transition-colors hover:bg-white/[0.04]"
              >
                Login
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="refx-beam refx-beam-live relative border-t border-white/[0.06] bg-[rgba(7,11,18,0.6)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 90% at 50% 130%, rgba(0,114,255,0.07), transparent 70%)",
          }}
        />
        <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-1">
            <LogoWordmark height={24} />
            <p className="max-w-xs text-sm text-muted-foreground">
              Premium server hosting for games, voice and the web. Switch games
              anytime, manage everything from one panel.
            </p>
            <div className="space-y-2">
              <p className="refx-eyebrow">Get the app</p>
              <AppStoreBadge />
            </div>
          </div>
          <FooterCol
            title="Platform"
            links={[
              { label: "Browse games", href: "/games" },
              { label: "Features", href: "/#features" },
              { label: "Client area", href: "/dashboard" },
            ]}
          />
          <FooterCol
            title="Account"
            links={[
              { label: "Login", href: "/login" },
              { label: "Create account", href: "/register" },
              { label: "Billing", href: "/billing" },
            ]}
          />
          <FooterCol
            title="Support"
            links={[
              { label: "Knowledge base", href: "/knowledge-base" },
              { label: "Help center", href: "/support" },
              { label: "System status", href: "/status" },
              { label: "Our team", href: "/team" },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { label: "Terms of Service", href: "/terms" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Acceptable Use", href: "/acceptable-use" },
              { label: "Refunds & Cancellation", href: "/refunds" },
            ]}
          />
        </div>
        <div className="relative border-t border-white/[0.04] py-5">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} {BRAND}. All rights reserved.
            </p>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <Link
                href="/terms"
                className="transition-colors hover:text-foreground"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/acceptable-use"
                className="transition-colors hover:text-foreground"
              >
                Acceptable Use
              </Link>
              <Link
                href="/refunds"
                className="transition-colors hover:text-foreground"
              >
                Refunds
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div className="space-y-3">
      <p className="refx-eyebrow">{title}</p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-block text-sm text-muted-foreground transition-[color,transform] hover:translate-x-0.5 hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
