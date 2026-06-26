"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "refx.cookie-consent.v1";

/**
 * Lightweight cookie acknowledgement banner. The platform uses only strictly
 * necessary cookies (sign-in) plus limited reliability telemetry — there are no
 * advertising/tracking cookies to toggle — so this is an honest acknowledgement
 * with a link to the Privacy Policy, not a fake "manage preferences" wall.
 * Choice is remembered in localStorage; renders nothing once acknowledged.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // localStorage is client-only, so the banner is intentionally shown after
    // mount (avoids an SSR/hydration mismatch) — hence setState in the effect.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch {
      // private mode / storage blocked — don't nag in a loop; stay hidden.
    }
  }, []);

  if (!show) return null;

  const acknowledge = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-white/[0.1] bg-[rgba(10,14,22,0.92)] p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4">
        <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
          We use strictly necessary cookies to keep you signed in and limited
          telemetry to keep the service reliable and secure. See our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/privacy">Learn more</Link>
          </Button>
          <Button size="sm" onClick={acknowledge}>
            Got it
          </Button>
        </div>
      </div>
    </div>
  );
}
