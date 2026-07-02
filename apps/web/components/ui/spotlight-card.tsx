"use client";

import { cn } from "@/lib/utils";
import { useSpotlight } from "@/hooks/use-spotlight";

/**
 * refx-card with the unified hover grammar + a cursor-tracking spotlight.
 * The light wash is pure CSS (.refx-spotlight reads --refx-mx/--refx-my);
 * this wrapper just feeds the vars via useSpotlight.
 */
export function SpotlightCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { ref, onMouseMove } = useSpotlight<HTMLDivElement>();
  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      className={cn(
        "refx-card refx-hover-card refx-spotlight rounded-2xl",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
