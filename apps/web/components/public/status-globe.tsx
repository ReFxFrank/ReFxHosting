"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";
import type { StatusLevel, StatusRegion } from "@/lib/types";
import { regionCoords } from "@/lib/geo";

/**
 * Cloudflare-style rotating globe (WebGL via `cobe`) rendered in ReFx blue. Plots
 * each datacenter region as a marker coloured-by-count of down nodes, auto-rotates,
 * and can be dragged to spin. Purely decorative + a live "global network" cue on
 * the status page — the authoritative per-region status stays in the list below.
 */
export function StatusGlobe({ regions = [] }: { regions?: StatusRegion[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerMovement = useRef(0);
  const rRef = useRef(0);
  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const scaleRef = useRef(1); // wheel-zoom factor (clamped)

  // Markers from the regions that have known coordinates. A region with any node
  // down is drawn slightly larger so trouble spots stand out on the spinning globe.
  const markers = regions
    .map((r) => {
      const c = regionCoords(r.code, r.country);
      if (!c) return null;
      const down = (r.status as StatusLevel) !== "operational";
      return {
        location: [c[0], c[1]] as [number, number],
        size: down ? 0.1 : 0.055,
      };
    })
    .filter(
      (m): m is { location: [number, number]; size: number } => m !== null,
    );

  // Re-init when the marker set changes (regions load in ~once).
  const markerKey = JSON.stringify(markers);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const onResize = () => {
      widthRef.current = canvas.offsetWidth;
    };
    onResize();
    window.addEventListener("resize", onResize);

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: widthRef.current * dpr,
      height: widthRef.current * dpr,
      phi: 0,
      theta: 0.28,
      dark: 1,
      diffuse: 1.2,
      // Denser dot map = more detailed, accurate coastlines than the default.
      mapSamples: 44000,
      mapBrightness: 5.5,
      scale: 1,
      // ReFx blue palette (RGB 0–1). base = the dotted landmasses, glow = the rim,
      // marker = the datacenter pins.
      baseColor: [0.26, 0.34, 0.48],
      markerColor: [0.16, 0.62, 1],
      glowColor: [0.12, 0.36, 0.7],
      markers,
    });

    // Scroll-to-zoom via cobe's `scale`, on a non-passive listener so we can stop
    // the page from scrolling while the pointer is over the globe.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = scaleRef.current - e.deltaY * 0.0015;
      scaleRef.current = Math.min(3, Math.max(0.8, next));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // This cobe build is driven by the caller: run a rAF loop and push the new
    // rotation, size and zoom each frame via update(). Auto-rotate (slowly) unless
    // the user is dragging or prefers reduced motion.
    let raf = 0;
    const tick = () => {
      if (pointerInteracting.current === null && !reduceMotion) {
        phiRef.current += 0.0016;
      }
      const w = widthRef.current * dpr;
      globe.update({
        phi: phiRef.current + rRef.current,
        width: w,
        height: w,
        scale: scaleRef.current,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Fade in once the first frame is drawn (avoids a flash of black canvas).
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });

    return () => {
      cancelAnimationFrame(raf);
      globe.destroy();
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey]);

  const onDown = (clientX: number) => {
    pointerInteracting.current = clientX - pointerMovement.current;
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
  };
  const onUp = () => {
    pointerInteracting.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  };
  const onMove = (clientX: number) => {
    if (pointerInteracting.current === null) return;
    const delta = clientX - pointerInteracting.current;
    pointerMovement.current = delta;
    rRef.current = delta / 200;
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={(e) => onDown(e.clientX)}
      onPointerUp={onUp}
      onPointerOut={onUp}
      onMouseMove={(e) => onMove(e.clientX)}
      onTouchStart={(e) => e.touches[0] && onDown(e.touches[0].clientX)}
      onTouchEnd={onUp}
      onTouchMove={(e) => e.touches[0] && onMove(e.touches[0].clientX)}
      className="mx-auto aspect-square w-full max-w-[440px] cursor-grab opacity-0 transition-opacity duration-700"
      style={{ contain: "layout paint size" }}
      aria-hidden="true"
    />
  );
}
