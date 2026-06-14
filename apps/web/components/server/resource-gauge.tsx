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
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  current: string;
  unit?: string;
  pctValue?: number;
  history: GaugePoint[];
  color?: string;
}) {
  const danger = (pctValue ?? 0) > 90;
  const warn = (pctValue ?? 0) > 70;
  const stroke = danger ? "hsl(var(--destructive))" : warn ? "hsl(var(--warning))" : color;

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
                danger ? "text-destructive" : warn ? "text-warning" : "text-muted-foreground",
              )}
            >
              {pctValue}%
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
                <linearGradient id={`g-${label}`} x1="0" y1="0" x2="0" y2="1">
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
                fill={`url(#g-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
