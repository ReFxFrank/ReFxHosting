"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const FALLBACK = "/games/presets/default.svg";

/**
 * Storefront game art with graceful degradation: any missing/broken image (egg
 * with no art, dead URL) falls back to the polished ReFx default placeholder.
 * Uses a plain <img> because sources are arbitrary admin-provided URLs or local
 * preset SVGs (not known at build time for next/image).
 */
export function GameImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={!src || failed ? FALLBACK : src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
