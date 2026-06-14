"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  // Ordering requires an authenticated account.
  const { authorized } = useRequireAuth();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            {BRAND_NAME}
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="size-4" /> Back to dashboard
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        {authorized ? children : <StoreShell />}
      </main>
    </div>
  );
}

function StoreShell() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
