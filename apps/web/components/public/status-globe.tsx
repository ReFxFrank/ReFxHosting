"use client";

import { useEffect, useRef } from "react";
import createGlobe from "cobe";
import type { StatusLevel, StatusRegion } from "@/lib/types";
import { regionCoords } from "@/lib/geo";

/**
 * How far the globe can be zoomed in (also the canvas oversize factor).
 *
 * Zoom works by rendering into a canvas MAX_ZOOM× larger than the visible
 * square and cropping with an overflow-hidden wrapper. Cobe clips its sphere
 * to the canvas framebuffer, so passing `scale > 1` used to slice the globe
 * (and its glow) off at the square canvas edges when zoomed in. By oversizing
 * the canvas and mapping the user zoom to `scale = zoom / MAX_ZOOM` (always
 * ≤ 1), the sphere always fits the framebuffer and zooming reveals a natural
 * circular crop instead of hard borders.
 */
const MAX_ZOOM = 2;
const MIN_ZOOM = 0.8;

/**
 * Cloudflare-style rotating globe (WebGL via `cobe`) rendered in ReFx blue. Plots
 * each datacenter region as a marker coloured-by-count of down nodes, auto-rotates,
 * and can be dragged to spin (scroll or pinch to zoom). Purely decorative + a live
 * "global network" cue on the status page — the authoritative per-region status
 * stays in the list below.
 */
export function StatusGlobe({ regions = [] }: { regions?: StatusRegion[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerMovement = useRef(0);
  const rRef = useRef(0);
  const phiRef = useRef(0);
  const widthRef = useRef(0); // canvas CSS size (wrapper × MAX_ZOOM)
  const zoomRef = useRef(0.9); // user zoom (under 1 so the rim glow shows)
  const pinchDist = useRef<number | null>(null);

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
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const onResize = () => {
      widthRef.current = wrapper.offsetWidth * MAX_ZOOM;
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
      scale: zoomRef.current / MAX_ZOOM,
      // ReFx blue palette (RGB 0–1). base = the dotted landmasses, glow = the rim,
      // marker = the datacenter pins.
      baseColor: [0.26, 0.34, 0.48],
      markerColor: [0.16, 0.62, 1],
      glowColor: [0.12, 0.36, 0.7],
      markers,
    });

    const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

    // Scroll-to-zoom, on a non-passive listener so we can stop the page from
    // scrolling while the pointer is over the globe.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = clampZoom(zoomRef.current - e.deltaY * 0.0015);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Pinch-to-zoom (mobile). Native non-passive listener — React's synthetic
    // touch events are passive, so preventDefault (to stop the page's own
    // pinch/scroll) only works here.
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchDist.current !== null) {
        zoomRef.current = clampZoom(
          zoomRef.current * (dist / pinchDist.current),
        );
      }
      pinchDist.current = dist;
    };
    const onTouchEndNative = () => {
      pinchDist.current = null;
    };
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEndNative);

    // This cobe build is driven by the caller: run a rAF loop and push the new
    // rotation, size and zoom each frame via update(). Auto-rotate (slowly) unless
    // the user is dragging or prefers reduced motion.
    let raf = 0;
    const tick = () => {
      if (pointerInteracting.current === null && !reduceMotion) {
        phiRef.current += 0.0009;
      }
      const w = widthRef.current * dpr;
      globe.update({
        phi: phiRef.current + rRef.current,
        width: w,
        height: w,
        // Never exceeds 1, so the sphere always fits the framebuffer (no
        // square clipping); the wrapper's overflow-hidden does the cropping.
        scale: zoomRef.current / MAX_ZOOM,
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
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEndNative);
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
    <div
      ref={wrapperRef}
      // rounded-full: the crop window must be CIRCULAR. With a square crop,
      // any zoom between 1 and √2 leaves the sphere's curved edge visible in
      // the square's corners (circle covers the sides but not the diagonal).
      // A circular window is concentric with the sphere, so every zoom ≥ 1
      // fills it completely — no corner artifacts at any zoom level.
      className="relative mx-auto aspect-square w-full max-w-[440px] overflow-hidden rounded-full"
      style={{ contain: "layout paint size" }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => onDown(e.clientX)}
        onPointerUp={onUp}
        onPointerOut={onUp}
        onMouseMove={(e) => onMove(e.clientX)}
        onTouchStart={(e) =>
          e.touches.length === 1 && e.touches[0] && onDown(e.touches[0].clientX)
        }
        onTouchEnd={onUp}
        onTouchMove={(e) =>
          e.touches.length === 1 && e.touches[0] && onMove(e.touches[0].clientX)
        }
        className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 cursor-grab opacity-0 transition-opacity duration-700"
        style={{ width: `${MAX_ZOOM * 100}%` }}
      />
    </div>
  );
}
