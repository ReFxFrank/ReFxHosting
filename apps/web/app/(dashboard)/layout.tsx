"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { TopNav, MobileNav } from "@/components/layout/topnav";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authorized } = useRequireAuth();

  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav />
        <MobileNav />
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-5 lg:p-6">
          {authorized ? children : <LoadingShell />}
        </main>
      </div>
    </div>
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
