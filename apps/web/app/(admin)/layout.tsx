"use client";

import { AdminSidebar, AdminMobileSidebar } from "@/components/layout/admin-sidebar";
import { AdminTopNav, AdminMobileNav } from "@/components/layout/admin-topnav";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { IdleSessionGuard } from "@/components/auth/idle-session-guard";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Dedicated staff/admin shell — its own sidebar, top bar and accent (the
 * `admin-scope` class re-tints the primary accent). Access is gated to staff
 * (SUPPORT/ADMIN/OWNER) here (client) and again server-side by the admin
 * controllers' guards; customers are redirected to /dashboard by the hook. The
 * sidebar is permission-filtered, so SUPPORT sees only what it can act on.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // SUPPORT staff get a read-only subset (nav is role-gated; write endpoints stay
  // ADMIN/OWNER and are enforced server-side).
  const { authorized } = useRequireAuth({ roles: ["SUPPORT", "ADMIN", "OWNER"] });

  return (
    <div className="admin-scope flex min-h-svh bg-[hsl(var(--background))]">
      <IdleSessionGuard />
      <AdminSidebar />
      <AdminMobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <AdminMobileNav />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 sm:p-5 lg:p-6">
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
