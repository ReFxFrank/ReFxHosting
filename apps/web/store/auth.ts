// Reactive auth/session state built on zustand, backed by lib/auth token store.
"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import { clearTokens, getTokens, setTokens } from "@/lib/auth";
import type { AuthTokens, GlobalRole, User } from "@/lib/types";

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
      clearTokens();
      set({ user: null, status: "unauthenticated" });
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
    return !!role && roles.includes(role);
  },

  isAdmin() {
    return get().hasRole("ADMIN", "OWNER");
  },
}));
