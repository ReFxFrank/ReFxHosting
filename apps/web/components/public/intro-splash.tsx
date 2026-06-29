"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogoWordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const SEEN_KEY = "refx-intro-v1";
const AUTO_MS = 5200;

/**
 * Cinematic, mouse-reactive intro overlay shown ONCE per session before the public
 * site — a brand reveal (logo + glow + a cursor-tracked spotlight over an animated
 * grid) that auto-dismisses, or the visitor clicks to enter. Pure CSS animations
 * (see globals.css → "refx-intro-*"); honours prefers-reduced-motion by skipping.
 */
export function IntroSplash() {
  const [phase, setPhase] = useState<"hidden" | "playing" | "exiting">("hidden");
  const spotRef = useRef<HTMLDivElement>(null);

  const enter = useCallback(() => {
    setPhase((p) => (p === "playing" ? "exiting" : p));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SEEN_KEY)) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      sessionStorage.setItem(SEEN_KEY, "1");
      return;
    }
    setPhase("playing");
    document.documentElement.style.overflow = "hidden";
    const t = setTimeout(enter, AUTO_MS);
    return () => clearTimeout(t);
  }, [enter]);

  // After the exit animation, unmount + restore scroll.
  useEffect(() => {
    if (phase !== "exiting") return;
    sessionStorage.setItem(SEEN_KEY, "1");
    const t = setTimeout(() => {
      setPhase("hidden");
      document.documentElement.style.overflow = "";
    }, 760);
    return () => clearTimeout(t);
  }, [phase]);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = spotRef.current;
    if (!el) return;
    el.style.setProperty("--mx", `${e.clientX}px`);
    el.style.setProperty("--my", `${e.clientY}px`);
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      role="button"
      aria-label="Enter ReFx Hosting"
      tabIndex={0}
      onClick={enter}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && enter()}
      onMouseMove={onMove}
      className={cn(
        "fixed inset-0 z-[100] flex cursor-pointer items-center justify-center overflow-hidden bg-[#05070d] outline-none",
        phase === "exiting" && "refx-intro-out",
      )}
    >
      {/* animated grid */}
      <div className="refx-intro-grid pointer-events-none absolute inset-0" />
      {/* brand glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 38%, rgba(0,114,255,0.22), transparent 70%), radial-gradient(40% 40% at 80% 72%, rgba(34,211,238,0.12), transparent 70%)",
        }}
      />
      {/* cursor-tracked spotlight (the interactive bit) — moved via transform */}
      <div ref={spotRef} className="refx-intro-spot pointer-events-none absolute" />

      <div className="relative flex flex-col items-center gap-6 px-6 text-center">
        <div className="refx-intro-logo">
          <LogoWordmark height={64} />
        </div>
        <p className="refx-intro-tag text-sm tracking-wide text-white/55">
          Multi‑game hosting, one platform.
        </p>
        <p className="refx-intro-hint mt-2 text-[11px] uppercase tracking-[0.35em] text-white/35">
          Click anywhere to enter
        </p>
      </div>

      {/* loading beam */}
      <div className="refx-intro-progress pointer-events-none absolute bottom-0 left-0 h-[2px]" />
    </div>
  );
}
