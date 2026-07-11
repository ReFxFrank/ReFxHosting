"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Visual-effects performance mode.
 *
 * The public site's ambience (aurora drift, headline shimmer, frosted-glass
 * headers, spotlight cards) is transform/opacity work that GPUs do for free —
 * but with hardware acceleration OFF the browser software-rasterizes those
 * layers every frame, continuously burning CPU and lagging the whole machine
 * (other windows, Discord screenshare, …).
 *
 * `perf-lite` on <html> switches the site to a static presentation (see the
 * `html.perf-lite` block in globals.css). It's chosen by, in priority order:
 *   1. an explicit user choice persisted in localStorage ("full" | "lite"),
 *   2. the OS `prefers-reduced-motion` setting,
 *   3. an automatic frame-rate probe: ~30 rAF frames measured shortly after
 *      load; a median frame time worse than ~28ms (≈35fps) while the ambient
 *      animations run means rendering is struggling — switch to lite.
 */
const EFFECTS_KEY = "refx-effects";
const PROBE_DELAY_MS = 1200;
const PROBE_FRAMES = 30;
const LITE_MEDIAN_MS = 28;

function apply(lite: boolean) {
  document.documentElement.classList.toggle("perf-lite", lite);
}

/** Current effects preference ("auto" when the user hasn't chosen). */
function storedMode(): "full" | "lite" | "auto" {
  try {
    const v = localStorage.getItem(EFFECTS_KEY);
    return v === "full" || v === "lite" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Mount once (root layout). Decides and applies the mode on load. */
export function EffectsModeInit() {
  useEffect(() => {
    const stored = storedMode();
    if (stored !== "auto") {
      apply(stored === "lite");
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(true);
      return;
    }

    // Auto: probe real frame pacing. Wait out initial load jank, and never
    // probe a hidden tab (rAF is throttled there and would false-positive).
    let raf = 0;
    let timer = 0;
    const probe = () => {
      if (document.hidden) return; // re-armed by visibilitychange below
      const deltas: number[] = [];
      let last = performance.now();
      const tick = (t: number) => {
        deltas.push(t - last);
        last = t;
        if (deltas.length < PROBE_FRAMES) {
          raf = requestAnimationFrame(tick);
          return;
        }
        deltas.sort((a, b) => a - b);
        const median = deltas[Math.floor(deltas.length / 2)];
        if (median > LITE_MEDIAN_MS) apply(true);
      };
      raf = requestAnimationFrame(tick);
    };
    const onVisible = () => {
      if (!document.hidden) {
        document.removeEventListener("visibilitychange", onVisible);
        timer = window.setTimeout(probe, PROBE_DELAY_MS);
      }
    };
    if (document.hidden) {
      document.addEventListener("visibilitychange", onVisible);
    } else {
      timer = window.setTimeout(probe, PROBE_DELAY_MS);
    }
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

const MODE_LABEL = {
  auto: "Visual effects: Auto",
  full: "Visual effects: On",
  lite: "Visual effects: Reduced",
} as const;

/**
 * Footer control cycling Auto → Reduced → On. "Reduced" is the escape hatch
 * for machines without GPU acceleration; "On" pins the full ambience even
 * where the auto-probe would back off.
 */
export function EffectsToggle() {
  const [mode, setMode] = useState<"full" | "lite" | "auto">("auto");
  useEffect(() => setMode(storedMode()), []);

  const cycle = () => {
    const next = mode === "auto" ? "lite" : mode === "lite" ? "full" : "auto";
    setMode(next);
    try {
      if (next === "auto") localStorage.removeItem(EFFECTS_KEY);
      else localStorage.setItem(EFFECTS_KEY, next);
    } catch {
      /* private mode: still applies for this page view */
    }
    // "auto" re-evaluates on next load; apply the conservative guess now.
    apply(
      next === "lite" ||
        (next === "auto" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    );
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      title="Reduced turns off ambient animations and glass blur — use it if the site feels laggy (e.g. hardware acceleration disabled)."
    >
      <Sparkles className="size-3.5" />
      {MODE_LABEL[mode]}
    </button>
  );
}
