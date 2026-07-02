"use client";

import { useCallback, useRef } from "react";

/**
 * Tracks the cursor inside an element via --refx-mx/--refx-my CSS vars, which
 * the .refx-spotlight / .refx-border-glow utilities read. Writes styles
 * directly on the node — zero React re-renders on mousemove, and only the
 * hovered card pays the getBoundingClientRect read.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const onMouseMove = useCallback((e: React.MouseEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--refx-mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--refx-my", `${e.clientY - r.top}px`);
  }, []);
  return { ref, onMouseMove };
}
