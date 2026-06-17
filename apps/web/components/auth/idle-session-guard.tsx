"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { isRemembered } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Idle before the "still here?" warning appears, and the grace period after. */
const WARN_AFTER_MS = 13 * 60 * 1000; // 13 min idle
const GRACE_MS = 2 * 60 * 1000; //        + 2 min to respond  = 15 min total

/** Shared across tabs so activity in ANY tab keeps every tab signed in. */
const ACTIVITY_KEY = "refx:last-activity";
/** Throttle localStorage writes (activity fires constantly). */
const WRITE_THROTTLE_MS = 2000;

// Broad set, capture-phase so events a child stops (e.g. the xterm console
// swallowing keydown) still count as activity. Pointer + input + focus cover
// touch, trackpads and typing inside embedded widgets.
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "click",
  "input",
  "focusin",
] as const;

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}
function writeShared(ts: number) {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(ts));
  } catch {
    /* private mode / disabled storage — fall back to in-tab only */
  }
}

/**
 * Signs an inactive client out cleanly. After WARN_AFTER_MS of no interaction it
 * shows a countdown dialog; ANY activity (in this tab OR another) keeps the
 * session alive, otherwise (or on a server-side session expiry) the user is sent
 * to /login. Activity is tracked in capture phase and shared across tabs via
 * localStorage, so an active user is never logged out by a stale background tab.
 * Mounted inside authenticated layouts only.
 */
export function IdleSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const lastActivity = useRef(0);
  const lastWrite = useRef(0);
  const graceEnd = useRef(0);
  const warnStart = useRef(0);
  const warning = useRef(false);
  const endedRef = useRef(false);

  const [warnOpen, setWarnOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(GRACE_MS / 1000));
  // "Keep me signed in" opts out of the inactivity sign-out. Tracked reactively
  // so logging in/out (which moves tokens between local/session storage) is
  // picked up without a reload. A server-side session expiry still signs out.
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    const sync = () => setRemembered(isRemembered());
    sync();
    window.addEventListener("refx:auth-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("refx:auth-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /** Record activity locally + (throttled) broadcast it to other tabs. */
  const markActivity = useCallback((ts: number = Date.now()) => {
    lastActivity.current = ts;
    if (ts - lastWrite.current >= WRITE_THROTTLE_MS) {
      lastWrite.current = ts;
      writeShared(ts);
    }
  }, []);

  /** Most-recent activity across this tab and all others. */
  const effectiveLastActivity = useCallback(
    () => Math.max(lastActivity.current, readShared()),
    [],
  );

  const endSession = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    warning.current = false;
    setWarnOpen(false);
    await logout();
    const search = typeof window !== "undefined" ? window.location.search : "";
    const next = encodeURIComponent(`${pathname ?? "/dashboard"}${search}`);
    router.replace(`/login?next=${next}&reason=timeout`);
  }, [logout, pathname, router]);

  const stay = useCallback(() => {
    warning.current = false;
    setWarnOpen(false);
    const ts = Date.now();
    lastWrite.current = ts;
    lastActivity.current = ts;
    writeShared(ts); // tell other tabs we're here too
    // Revalidate in the background (refreshes the access token if it expired
    // while idle); keeps the user signed in.
    void refreshUser();
  }, [refreshUser]);

  // Track activity (capture phase so nothing can swallow it before us).
  useEffect(() => {
    const onActivity = () => markActivity();
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { capture: true, passive: true }),
    );
    // Returning to the tab (or another tab broadcasting activity) counts too.
    const onVisible = () => {
      if (document.visibilityState === "visible") markActivity();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(e.newValue) || 0);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      ACTIVITY_EVENTS.forEach((e) =>
        window.removeEventListener(e, onActivity, { capture: true } as EventListenerOptions),
      );
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [markActivity]);

  // A server-side session expiry (refresh token rejected) ends the session now.
  useEffect(() => {
    const onExpired = () => void endSession();
    window.addEventListener("refx:session-expired", onExpired);
    return () => window.removeEventListener("refx:session-expired", onExpired);
  }, [endSession]);

  // Poll for idleness once per second while authenticated — UNLESS the user
  // chose "Keep me signed in", in which case inactivity never signs them out
  // (the session lives until they log out or the server-side session expires).
  useEffect(() => {
    // Not signed in, or "remembered" → no inactivity timer at all.
    if (status !== "authenticated" || remembered) return;
    endedRef.current = false;
    markActivity(Date.now()); // fresh baseline when the session starts
    const tick = setInterval(() => {
      const now = Date.now();
      const last = effectiveLastActivity();
      if (warning.current) {
        // Any activity after the warning opened (this tab or another) cancels it.
        if (last > warnStart.current) {
          warning.current = false;
          setWarnOpen(false);
          return;
        }
        const remaining = graceEnd.current - now;
        if (remaining <= 0) {
          void endSession();
        } else {
          setSecondsLeft(Math.ceil(remaining / 1000));
        }
      } else if (now - last >= WARN_AFTER_MS) {
        warning.current = true;
        warnStart.current = now;
        graceEnd.current = now + GRACE_MS;
        setSecondsLeft(Math.floor(GRACE_MS / 1000));
        setWarnOpen(true);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [status, remembered, endSession, effectiveLastActivity, markActivity]);

  if (status !== "authenticated") return null;

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Dialog open={warnOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="size-5 text-warning" /> Are you still here?
          </DialogTitle>
          <DialogDescription>
            You&apos;ve been inactive for a while. For your security you&apos;ll be signed out
            in <span className="font-semibold tabular-nums text-foreground">{mm}:{ss}</span>.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => void endSession()}>
            Sign out
          </Button>
          <Button onClick={stay}>Stay signed in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
