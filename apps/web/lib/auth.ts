// Token storage + low-level session helpers.
// Tokens live in localStorage (access + refresh). The access token is short-lived;
// lib/api.ts performs transparent refresh. The zustand store (store/auth.ts)
// wraps this with reactive user state.
//
// NOTE: For a hardened production deploy, prefer httpOnly cookies set by the
// panel-api. TODO(impl): cookie-based session via a Next.js route handler proxy.

import type { AuthTokens } from "@/lib/types";

const TOKENS_KEY = "refx.tokens";

const isBrowser = typeof window !== "undefined";

let memoryTokens: AuthTokens | null = null;

export function getTokens(): AuthTokens | null {
  if (memoryTokens) return memoryTokens;
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    memoryTokens = raw ? (JSON.parse(raw) as AuthTokens) : null;
    return memoryTokens;
  } catch {
    return null;
  }
}

export function setTokens(tokens: AuthTokens) {
  memoryTokens = tokens;
  if (isBrowser) {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    // Notify other tabs / the store.
    window.dispatchEvent(new CustomEvent("refx:auth-changed"));
  }
}

export function clearTokens() {
  memoryTokens = null;
  if (isBrowser) {
    window.localStorage.removeItem(TOKENS_KEY);
    window.dispatchEvent(new CustomEvent("refx:auth-changed"));
  }
}

export function isAuthenticated() {
  return !!getTokens()?.accessToken;
}

/** Decode a JWT payload without verifying (UI hints only — never trust client-side). */
export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as T;
  } catch {
    return null;
  }
}
