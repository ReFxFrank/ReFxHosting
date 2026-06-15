// Reactive auth/session state built on zustand, backed by lib/auth token store.
"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { clearTokens, getTokens, setTokens } from "@/lib/auth";
import type { AuthTokens, GlobalRole, User } from "@/lib/types";

/** Role hierarchy, identical to the panel-api RolesGuard. */
const ROLE_RANK: Record<GlobalRole, number> = {
  CUSTOMER: 0,
  SUPPORT: 1,
  ADMIN: 2,
  OWNER: 3,
};

interface AuthState {
  user: User | null;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
  setSession: (
    tokens: AuthTokens,
    user?: User,
    remember?: boolean,
  ) => Promise<void>;
  refreshUser: () => Promise<void>;
  bootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: GlobalRole[]) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",

  async setSession(tokens, user, remember = true) {
    setTokens(tokens, remember);
    if (user) {
      set({ user, status: "authenticated" });
    } else {
      await get().refreshUser();
    }
  },

  async refreshUser() {
    try {
      const user = await api.auth.me();
      set({ user, status: "authenticated" });
    } catch {
      // If our tokens are gone, the refresh path determined we're truly logged
      // out. If they're still present this was transient (e.g. the panel was
      // mid-rebuild) — keep the session and retry shortly rather than logging
      // the user out.
      if (!getTokens()?.accessToken) {
        clearTokens();
        set({ user: null, status: "unauthenticated" });
        return;
      }
      set((s) => ({ status: s.user ? "authenticated" : "loading" }));
      setTimeout(() => {
        void get().refreshUser();
      }, 3000);
    }
  },

  async bootstrap() {
    if (!getTokens()?.accessToken) {
      set({ status: "unauthenticated" });
      return;
    }
    set({ status: "loading" });
    await get().refreshUser();
  },

  async logout() {
    try {
      await api.auth.logout();
    } catch {
      // ignore — clear locally regardless
    }
    clearTokens();
    set({ user: null, status: "unauthenticated" });
  },

  hasRole(...roles) {
    const role = get().user?.globalRole;
    if (!role) return false;
    // Rank-based, mirroring the backend RolesGuard: a higher role satisfies a
    // requirement for any lower one (OWNER > ADMIN > SUPPORT > CUSTOMER). So
    // hasRole("ADMIN") is true for an OWNER, while hasRole("OWNER") is not for
    // an ADMIN.
    const min = Math.min(...roles.map((r) => ROLE_RANK[r]));
    return ROLE_RANK[role] >= min;
  },

  isAdmin() {
    return get().hasRole("ADMIN", "OWNER");
  },
}));
