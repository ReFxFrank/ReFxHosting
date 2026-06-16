"use client";

import { cn } from "@/lib/utils";

export interface AvatarGroupItem {
  name: string;
  avatarUrl?: string | null;
}

/** Initials from a display name (max two letters). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * Overlapping avatar stack that gently spreads apart on hover and lifts the
 * hovered avatar — animation-only via GPU-friendly transforms (no backdrop
 * filters), so it stays smooth.
 */
export function AvatarGroup({
  items,
  max = 8,
  size = 44,
  className,
}: {
  items: AvatarGroupItem[];
  max?: number;
  size?: number;
  className?: string;
}) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;

  return (
    <div className={cn("group/ag flex items-center", className)}>
      {shown.map((it, i) => (
        <div
          key={i}
          title={it.name}
          style={{ width: size, height: size }}
          className={cn(
            "relative grid place-items-center overflow-hidden rounded-full bg-[linear-gradient(180deg,rgba(40,140,255,0.35),rgba(0,114,255,0.15))] text-xs font-semibold text-white ring-2 ring-[#0b1220] transition-[margin,transform] duration-300 ease-out hover:z-20 hover:-translate-y-1 hover:scale-110",
            i > 0 && "-ml-3 group-hover/ag:ml-1",
          )}
        >
          {it.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.avatarUrl} alt={it.name} className="size-full object-cover" />
          ) : (
            <span>{initials(it.name)}</span>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{ width: size, height: size }}
          className="-ml-3 grid place-items-center rounded-full bg-white/10 text-xs font-semibold text-muted-foreground ring-2 ring-[#0b1220] transition-[margin] duration-300 ease-out group-hover/ag:ml-1"
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
