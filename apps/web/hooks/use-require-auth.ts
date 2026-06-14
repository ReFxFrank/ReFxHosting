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
      const next = encodeURIComponent(pathname ?? "/dashboard");
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
