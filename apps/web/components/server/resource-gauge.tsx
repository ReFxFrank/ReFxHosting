"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface GaugePoint {
  t: number;
  value: number;
}

export function ResourceGauge({
  label,
  icon: Icon,
  current,
  unit,
  pctValue,
  history,
  color = "hsl(var(--primary))",
  burst = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  current: string;
  unit?: string;
  pctValue?: number;
  history: GaugePoint[];
  color?: string;
  /** Above-plan usage that is EXPECTED (CPU burst) — suppresses the
   *  danger/warn tint and labels the % as burst instead of alarming. */
  burst?: boolean;
}) {
  const danger = !burst && (pctValue ?? 0) > 90;
  const warn = !burst && (pctValue ?? 0) > 70;
  const stroke = danger ? "hsl(var(--destructive))" : warn ? "hsl(var(--warning))" : color;
  // SVG paint references (url(#id)) break on ids with spaces/specials.
  const gradientId = `g-${label.replace(/[^A-Za-z0-9_-]/g, "")}`;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-4" /> {label}
          </span>
          {pctValue !== undefined && (
            <span
              className={cn(
                "text-xs font-medium",
                danger
                  ? "text-destructive"
                  : warn
                    ? "text-warning"
                    : burst && pctValue > 100
                      ? "text-primary"
                      : "text-muted-foreground",
              )}
            >
              {pctValue}%{burst && pctValue > 100 ? " · burst" : ""}
            </span>
          )}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {current}
          {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
        </div>
        <div className="-mx-1 mt-2 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, "dataMax"]} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
