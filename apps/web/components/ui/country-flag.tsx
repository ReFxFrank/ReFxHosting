"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cross-platform country flag.
 *
 * Emoji flags (regional-indicator codepoints) DON'T render on Windows — Chrome/
 * Edge there show the two-letter code instead (e.g. "CA"). So render an SVG flag
 * image, and if it can't load (offline / blocked / unknown code) fall back to a
 * styled uppercase code chip so it still looks intentional everywhere.
 */
export function CountryFlag({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}) {
  const cc = (code ?? "").trim().toLowerCase();
  const valid = /^[a-z]{2}$/.test(cc);
  const [failed, setFailed] = useState(false);

  if (!valid || failed) {
    if (!cc) return null;
    return (
      <span
        className={cn(
          "inline-flex h-[13px] min-w-[18px] items-center justify-center rounded-[2px] bg-white/10 px-1 text-[9px] font-semibold uppercase leading-none text-white/70",
          className,
        )}
        aria-label={cc.toUpperCase()}
      >
        {cc}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${cc}.svg`}
      alt={cc.toUpperCase()}
      width={18}
      height={13}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        "inline-block h-[13px] w-[18px] rounded-[2px] object-cover align-[-2px]",
        className,
      )}
    />
  );
}
