"use client";

import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav, MobileNav } from "@/components/layout/topnav";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { IdleSessionGuard } from "@/components/auth/idle-session-guard";
import { Skeleton } from "@/components/ui/skeleton";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";
const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Acceptable Use", href: "/acceptable-use" },
  { label: "Refunds", href: "/refunds" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authorized } = useRequireAuth();

  return (
    <div className="flex min-h-svh">
      <IdleSessionGuard />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <MobileNav />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-5 lg:p-6">
          {authorized ? children : <LoadingShell />}
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}

function DashboardFooter() {
  return (
    <footer className="border-t border-white/[0.06] px-4 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {BRAND}
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
