"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import type { GlobalRole } from "@/lib/types";

/** Bootstraps the session and redirects unauthenticated users to /login. */
export function useRequireAuth(opts?: { roles?: GlobalRole[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, bootstrap, hasRole } = useAuthStore();

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (status === "unauthenticated") {
      // Preserve the full target incl. query (e.g. /order?game=…&plan=…) so the
      // storefront → checkout preselection survives the login/register round-trip.
      const search = typeof window !== "undefined" ? window.location.search : "";
      const next = encodeURIComponent(`${pathname ?? "/dashboard"}${search}`);
      router.replace(`/login?next=${next}`);
    }
  }, [status, pathname, router]);

  const authorized =
    status === "authenticated" && (!opts?.roles || hasRole(...opts.roles));

  useEffect(() => {
    if (status === "authenticated" && opts?.roles && !hasRole(...opts.roles)) {
      router.replace("/dashboard");
    }
  }, [status, opts?.roles, hasRole, router]);

  return { status, user, authorized };
}
