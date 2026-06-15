import Link from "next/link";
import {
  ArrowRight,
  Zap,
  ShieldCheck,
  Server,
  SlidersHorizontal,
  Puzzle,
  CreditCard,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

/** Hero/splash with headline, CTAs and a glassy beam backdrop. */
export function HeroSplash() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(0,114,255,0.18), transparent 70%), radial-gradient(40% 40% at 85% 30%, rgba(34,211,238,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-16 text-center sm:px-6 sm:pt-24">
        <p className="refx-eyebrow mx-auto mb-4 inline-flex items-center gap-2">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          Multi-game hosting, one platform
        </p>
        <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
          Game server hosting that{" "}
          <span className="bg-gradient-to-r from-[#3aa0ff] to-[#22d3ee] bg-clip-text text-transparent">
            switches games on demand
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
          Buy a server once and swap between Minecraft, Rust, Valheim and more —
          no re-purchase. Instant setup, DDoS protection, and one clean panel for
          servers and billing.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" asChild>
            <Link href="/games">
              Browse games <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Client area</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Trusted infrastructure · {BRAND}
        </p>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Zap, title: "Instant setup", body: "Servers provision automatically the moment you order." },
  { icon: ShieldCheck, title: "DDoS protection", body: "Always-on mitigation keeps your community online." },
  { icon: Server, title: "Powerful nodes", body: "Modern CPUs and NVMe storage for low-latency play." },
  { icon: SlidersHorizontal, title: "Simple control panel", body: "Console, files, backups and databases in one place." },
  { icon: Puzzle, title: "Mod & plugin support", body: "Fabric, Forge, NeoForge and plugins where supported." },
  { icon: Repeat, title: "Switch games anytime", body: "Keep your server identity — change the game underneath." },
  { icon: CreditCard, title: "Unified billing", body: "One account for billing and every game server you run." },
];

export function HostingFeatureCards() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mb-8 text-center">
        <p className="refx-eyebrow">Why ReFx</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight">Everything you need to host</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="refx-card rounded-2xl p-5">
            <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="size-5" />
            </div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
