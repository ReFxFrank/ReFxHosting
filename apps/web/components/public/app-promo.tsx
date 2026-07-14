import { Bell, Power, CreditCard, Monitor } from "lucide-react";
import { AppStoreBadge } from "@/components/public/app-store-badge";
import { WindowsBadge } from "@/components/public/windows-badge";
import { LEGAL } from "@/lib/legal";

const POINTS = [
  { icon: Power, label: "Start, stop & monitor your servers on the go" },
  { icon: Bell, label: "Instant push alerts for status, billing & support" },
  { icon: CreditCard, label: "Manage invoices, plans & payment methods" },
  {
    icon: Monitor,
    label: "ReFx Remote on Windows — a native desktop app, no browser needed",
  },
];

/** Marketing band promoting the companion apps (iOS + ReFx Remote for Windows). */
export function AppPromo() {
  return (
    <section
      id="app"
      className="refx-cv mx-auto w-full max-w-6xl px-4 py-16 sm:px-6"
    >
      <div className="refx-beam refx-beam-live relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[rgba(10,14,22,0.6)] p-8 sm:p-12">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="space-y-6">
            <p className="refx-eyebrow">{LEGAL.brand} companion apps</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your servers, everywhere
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Take the {LEGAL.brand} control panel beyond the browser — the
              native <strong>iOS app</strong> puts your servers in your pocket,
              and <strong>ReFx Remote</strong> brings them to your Windows
              desktop as a ready-to-run app. Power servers, watch status live,
              handle billing and support, wherever you are.
            </p>
            <ul className="space-y-3">
              {POINTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                    <Icon className="size-4 text-foreground" />
                  </span>
                  <span className="text-muted-foreground">{label}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <AppStoreBadge />
              <WindowsBadge />
            </div>
          </div>

          {/* Lightweight phone mock — no asset dependency. */}
          <div className="hidden justify-center md:flex">
            <div className="relative h-[420px] w-[210px] rounded-[2.25rem] border border-white/[0.12] bg-[rgba(7,11,18,0.9)] p-3 shadow-2xl">
              <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full bg-black/60" />
              <div className="flex h-full flex-col gap-3 overflow-hidden rounded-[1.8rem] bg-gradient-to-b from-white/[0.06] to-transparent p-4 pt-8">
                <div className="h-3 w-20 rounded bg-white/15" />
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <div className="h-2.5 w-16 rounded bg-white/20" />
                    <div className="h-4 w-12 rounded-full bg-emerald-500/30" />
                  </div>
                  <div className="mt-3 h-2 w-24 rounded bg-white/10" />
                  <div className="mt-2 h-2 w-20 rounded bg-white/10" />
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <div className="h-2.5 w-14 rounded bg-white/20" />
                  <div className="mt-3 h-2 w-28 rounded bg-white/10" />
                  <div className="mt-2 h-2 w-16 rounded bg-white/10" />
                </div>
                <div className="mt-auto h-9 rounded-xl bg-white/[0.08]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
