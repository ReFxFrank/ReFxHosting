// Token storage + low-level session helpers.
//
// Tokens live in EITHER localStorage (Remember me — survives browser restarts)
// or sessionStorage (this-tab/session only). The access token is short-lived and
// lib/api.ts performs transparent refresh-rotation.
//
// Cross-tab safety: because the backend rotates refresh tokens and revokes the
// whole session family if a stale one is replayed, every tab must use the latest
// token. We listen for `storage` events and drop the in-memory cache so other
// tabs re-read the freshest token instead of replaying an old one (which would
// otherwise log everyone out).
//
// NOTE: For a hardened deploy, prefer httpOnly cookies. TODO(impl).

import type { AuthTokens } from "@/lib/types";

const TOKENS_KEY = "refx.tokens";
const isBrowser = typeof window !== "undefined";

let memoryTokens: AuthTokens | null = null;

function readFrom(storage: Storage): AuthTokens | null {
  try {
    const raw = storage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  } catch {
    return null;
  }
}

/** Where tokens currently live (local = remembered, session = this session). */
function currentStorage(): Storage | null {
  if (!isBrowser) return null;
  if (window.localStorage.getItem(TOKENS_KEY)) return window.localStorage;
  if (window.sessionStorage.getItem(TOKENS_KEY)) return window.sessionStorage;
  return null;
}

export function getTokens(): AuthTokens | null {
  if (memoryTokens) return memoryTokens;
  if (!isBrowser) return null;
  memoryTokens =
    readFrom(window.localStorage) ?? readFrom(window.sessionStorage);
  return memoryTokens;
}

/**
 * Persist tokens. `remember`:
 *   - true   → localStorage (stay signed in across restarts)
 *   - false  → sessionStorage (cleared when the browser/tab closes)
 *   - undefined → keep the current location (used by silent refresh so it
 *                 doesn't change the user's Remember-me choice)
 */
export function setTokens(tokens: AuthTokens, remember?: boolean) {
  memoryTokens = tokens;
  if (!isBrowser) return;

  let target: Storage;
  if (remember === undefined) {
    target = currentStorage() ?? window.localStorage;
  } else {
    target = remember ? window.localStorage : window.sessionStorage;
  }
  // Never leave a stale copy in the other store.
  const other =
    target === window.localStorage ? window.sessionStorage : window.localStorage;
  try {
    other.removeItem(TOKENS_KEY);
    target.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    /* storage unavailable (private mode) — the memory cache still works */
  }
  window.dispatchEvent(new CustomEvent("refx:auth-changed"));
}

export function clearTokens() {
  memoryTokens = null;
  if (isBrowser) {
    try {
      window.localStorage.removeItem(TOKENS_KEY);
      window.sessionStorage.removeItem(TOKENS_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("refx:auth-changed"));
  }
}

export function isAuthenticated() {
  return !!getTokens()?.accessToken;
}

// Keep tabs in sync: when another tab rotates/clears tokens, drop our cache so
// the next read picks up the latest value (prevents stale-refresh mass logout).
if (isBrowser) {
  window.addEventListener("storage", (e) => {
    if (e.key === TOKENS_KEY || e.key === null) {
      memoryTokens = null;
      window.dispatchEvent(new CustomEvent("refx:auth-changed"));
    }
  });
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
