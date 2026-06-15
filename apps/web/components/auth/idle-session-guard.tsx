"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Clock } from "lucide-react";
import { useAuthStore } from "@/store/auth";
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

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

/**
 * Signs an inactive client out cleanly. After WARN_AFTER_MS of no interaction it
 * shows a countdown dialog; staying keeps the session alive, otherwise (or on a
 * server-side session expiry) the user is redirected to /login instead of being
 * left looking at hidden/blank data. Mounted inside authenticated layouts only.
 */
export function IdleSessionGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const lastActivity = useRef(0);
  const graceEnd = useRef(0);
  const warning = useRef(false);
  const endedRef = useRef(false);

  const [warnOpen, setWarnOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(GRACE_MS / 1000));

  const endSession = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setWarnOpen(false);
    await logout();
    const search = typeof window !== "undefined" ? window.location.search : "";
    const next = encodeURIComponent(`${pathname ?? "/dashboard"}${search}`);
    router.replace(`/login?next=${next}&reason=timeout`);
  }, [logout, pathname, router]);

  const stay = useCallback(() => {
    warning.current = false;
    setWarnOpen(false);
    lastActivity.current = Date.now();
    // Revalidate the session in the background (refreshes the access token if
    // it expired while idle); keeps the user signed in.
    void refreshUser();
  }, [refreshUser]);

  // Track activity (ignored while the warning is up — the user must respond).
  useEffect(() => {
    const onActivity = () => {
      if (!warning.current) lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true }),
    );
    return () =>
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
  }, []);

  // A server-side session expiry (refresh token rejected) ends the session now.
  useEffect(() => {
    const onExpired = () => void endSession();
    window.addEventListener("refx:session-expired", onExpired);
    return () => window.removeEventListener("refx:session-expired", onExpired);
  }, [endSession]);

  // Poll for idleness once per second while authenticated.
  useEffect(() => {
    if (status !== "authenticated") return;
    endedRef.current = false;
    lastActivity.current = Date.now(); // fresh baseline when the session starts
    const tick = setInterval(() => {
      const now = Date.now();
      if (warning.current) {
        const remaining = graceEnd.current - now;
        if (remaining <= 0) {
          void endSession();
        } else {
          setSecondsLeft(Math.ceil(remaining / 1000));
        }
      } else if (now - lastActivity.current >= WARN_AFTER_MS) {
        warning.current = true;
        graceEnd.current = now + GRACE_MS;
        setSecondsLeft(Math.floor(GRACE_MS / 1000));
        setWarnOpen(true);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [status, endSession]);

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
