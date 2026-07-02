"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts 0 → target the first time the element scrolls into view (same
 * IntersectionObserver pattern as <Reveal>). rAF-driven with an ease-out
 * cubic, so it decelerates into the final value. Reduced motion renders the
 * final value immediately.
 */
export function useCountUp(
  target: number,
  {
    durationMs = 1400,
    decimals = 0,
  }: { durationMs?: number; decimals?: number } = {},
) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / durationMs, 1);
          setV(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs]);

  return { ref, display: v.toFixed(decimals) };
}
