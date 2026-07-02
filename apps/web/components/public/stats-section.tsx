"use client";

import { useCountUp } from "@/hooks/use-count-up";

const STATS = [
  { value: 30, suffix: "+", label: "Games ready to deploy" },
  { value: 99.9, decimals: 1, suffix: "%", label: "Uptime across nodes" },
  { value: 24, suffix: "/7", label: "Human support" },
  { value: 3, suffix: "", label: "Product lines, one panel" },
];

function Stat({
  value,
  decimals = 0,
  suffix,
  label,
}: {
  value: number;
  decimals?: number;
  suffix: string;
  label: string;
}) {
  const { ref, display } = useCountUp(value, { decimals });
  return (
    <div className="text-center">
      <p className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
        <span
          ref={ref}
          className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent"
        >
          {display}
          {suffix}
        </span>
      </p>
      <p className="refx-eyebrow mt-2">{label}</p>
    </div>
  );
}

/** Proof-point band: numerals count up when scrolled into view. */
export function StatsSection() {
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015]">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-8 px-4 py-12 sm:px-6 lg:grid-cols-4">
        {STATS.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}
