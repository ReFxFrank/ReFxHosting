import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  indicatorClassName?: string;
}

/** Slim usage bar used in gauges and resource summaries. */
export function Progress({ value, className, indicatorClassName, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full border border-white/[0.06] bg-[rgba(7,13,24,0.7)]",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary shadow-[0_0_12px_-2px_rgba(0,114,255,0.7)] transition-all",
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
