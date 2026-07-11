import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
  Gamepad2,
  Mic,
  Globe,
  Terminal,
  FolderTree,
  Database,
  Clock,
  Users,
  LifeBuoy,
  Activity,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { HeroKbSearch } from "@/components/public/hero-kb-search";

const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? "ReFx Hosting";

/**
 * Ambient aurora backdrop for the top of the homepage: three slow-drifting
 * glow layers + a static etched grid faded in by a CSS mask. Rendered once by
 * the page around BOTH the alert banner and the hero so the glow is seamless
 * whether or not an alert is shown (otherwise the banner pushes the hero down
 * and exposes a seam at the hero's top edge). The wrapper keeps refx-enter-glow
 * so the first-paint "lights up" entrance is unchanged.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="refx-enter-glow pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="refx-aurora refx-aurora-a" />
      <div className="refx-aurora refx-aurora-b" />
      <div className="refx-aurora refx-aurora-c" />
      <div className="refx-hero-grid" />
    </div>
  );
}

/** Hero/splash with headline + CTAs (backdrop supplied by the page wrapper). */
export function HeroSplash() {
  // Social proof: real fleet counters (public, cached server-side). Falls back
  // to the static line until data arrives / when the fleet is quiet.
  const live = useQuery({
    queryKey: ["status", "live"],
    queryFn: () => api.statusLive(),
    staleTime: 60_000,
    retry: false,
  });
  const counts = live.data;
  const showLive = !!counts && counts.serversOnline > 0;
  return (
    <section className="relative">
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-12 pt-12 text-center sm:px-6 sm:pt-20">
        <p className="refx-eyebrow refx-enter refx-enter-1 mx-auto mb-4 inline-flex items-center gap-2">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          {showLive ? (
            <>
              {counts!.serversOnline} server{counts!.serversOnline === 1 ? "" : "s"} online
              {counts!.playersOnline > 0 && (
                <> · {counts!.playersOnline} player{counts!.playersOnline === 1 ? "" : "s"} in game right now</>
              )}
            </>
          ) : (
            <>Game · Voice · Web — one platform</>
          )}
        </p>
        <h1 className="refx-enter-hero mx-auto max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
          Server hosting for{" "}
          <span className="refx-text-shimmer">games, voice &amp; the web</span>
        </h1>
        <p className="refx-enter refx-enter-3 mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
          Run game servers, TeamSpeak voice, and web hosting from a single
          account. Instant setup, DDoS protection, and NVMe nodes — all managed
          from one clean panel. Switch your game anytime without re-purchasing.
        </p>
        <div className="refx-enter refx-enter-4 mx-auto mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Button
            size="lg"
            asChild
            className="refx-sheen relative w-full sm:w-auto"
          >
            <Link href="/games">
              Browse hosting <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="w-full sm:w-auto"
          >
            <Link href="/login">Client area</Link>
          </Button>
        </div>
        <p className="refx-enter refx-enter-5 mt-4 text-xs text-muted-foreground">
          Instant setup · DDoS protected · {BRAND}
        </p>
        <HeroKbSearch />
      </div>
    </section>
  );
}

const SERVICES = [
  {
    icon: Gamepad2,
    title: "Game servers",
    href: "/games",
    cta: "Browse games",
    body: "30+ titles — Minecraft, Rust, ARK, Valheim, Palworld and more. Provision in minutes, then switch the game on a server anytime while keeping its identity, backups and subscription.",
    accent: "text-[#3aa0ff]",
  },
  {
    icon: Mic,
    title: "Voice servers",
    href: "/voice",
    cta: "Browse voice",
    body: "Crystal-clear, low-latency TeamSpeak voice servers priced per slot. Always-on, DDoS-protected, and managed from the same panel as the rest of your servers.",
    accent: "text-[#22d3ee]",
  },
  {
    icon: Globe,
    title: "Web hosting",
    href: "/web-hosting",
    cta: "Browse web hosting",
    body: "Host websites and apps with automatic SSL, custom domains and fast NVMe storage. Starter through Pro tiers that scale CPU, memory and disk as you grow.",
    accent: "text-emerald-400",
  },
];

/** "What we host" — the three product lines, with a route into each catalog. */
export function ServicesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <Reveal>
        <div className="mb-8 text-center">
          <p className="refx-eyebrow">What we host</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            One platform, every kind of server
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground">
            Whatever you&apos;re running, it lives in the same account with
            unified billing and a single panel — no juggling providers.
          </p>
        </div>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {SERVICES.map((s, i) => (
          <Reveal key={s.title} delayMs={i * 90} className="h-full">
            <SpotlightCard className="group flex h-full flex-col p-6">
              <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-white/[0.04]">
                <s.icon className={`size-6 ${s.accent}`} />
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">
                {s.body}
              </p>
              <Link
                href={s.href}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-foreground"
              >
                {s.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const PANEL_FEATURES = [
  {
    icon: Terminal,
    title: "Live console",
    body: "Real-time console with command input and full server output streaming.",
  },
  {
    icon: FolderTree,
    title: "File manager + SFTP",
    body: "Browse, edit and upload files in-browser, or connect over secure SFTP.",
  },
  {
    icon: Server,
    title: "One-click backups",
    body: "Snapshot your server on demand or on a schedule, and restore in seconds.",
  },
  {
    icon: Database,
    title: "Databases",
    body: "Spin up managed databases for your server with credentials handled for you.",
  },
  {
    icon: Clock,
    title: "Scheduled tasks",
    body: "Automate restarts, backups and commands with cron-style schedules.",
  },
  {
    icon: Users,
    title: "Sub-users & permissions",
    body: "Invite staff with fine-grained, per-server access — no shared logins.",
  },
  {
    icon: Puzzle,
    title: "Mods, plugins & modpacks",
    body: "Fabric, Forge, NeoForge, plugins and one-click modpack installs where supported.",
  },
  {
    icon: Repeat,
    title: "Switch games anytime",
    body: "Keep your server's identity, SFTP and backups — change the game underneath.",
  },
  {
    icon: Zap,
    title: "Instant setup",
    body: "Servers provision automatically the moment your order completes.",
  },
];

/** Panel capabilities — what you actually get inside the control panel. */
export function HostingFeatureCards() {
  return (
    <section
      id="features"
      className="refx-cv mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6"
    >
      <Reveal>
        <div className="mb-8 text-center">
          <p className="refx-eyebrow">Your control panel</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            Everything to run a server, in one place
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground">
            A fast, modern panel that puts your console, files, backups,
            databases and automation a click away — on every server you host.
          </p>
        </div>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PANEL_FEATURES.map((f, i) => (
          <Reveal key={f.title} delayMs={(i % 3) * 90} className="h-full">
            <SpotlightCard className="h-full p-5">
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const SUPPORT = [
  {
    icon: LifeBuoy,
    title: "Real support, fast",
    body: "Open a ticket from your dashboard and reach our team — we follow every issue through to a fix.",
  },
  {
    icon: ShieldCheck,
    title: "DDoS protection",
    body: "Always-on mitigation across every node keeps your community and sites online under attack.",
  },
  {
    icon: Activity,
    title: "Status & incidents",
    body: "A live status page with incident history so you always know exactly what's happening.",
  },
  {
    icon: Lock,
    title: "Secure by default",
    body: "Two-factor and WebAuthn logins, scoped API keys, and encrypted secrets at rest.",
  },
  {
    icon: Server,
    title: "Modern NVMe nodes",
    body: "High-clock CPUs and NVMe storage tuned for low latency and quick installs.",
  },
  {
    icon: CreditCard,
    title: "Unified billing",
    body: "One account and one invoice for every game, voice and web server you run.",
  },
];

/** Support + reliability — services and guarantees beyond raw hosting. */
export function SupportSection() {
  return (
    <section className="refx-cv border-y border-white/[0.06] bg-white/[0.015]">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <div className="mb-8 text-center">
            <p className="refx-eyebrow">Support &amp; reliability</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              We keep you online and looked after
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground">
              Hosting is more than a box — it&apos;s the protection, monitoring
              and help behind it. Here&apos;s what backs every plan.
            </p>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SUPPORT.map((s, i) => (
            <Reveal key={s.title} delayMs={(i % 3) * 90} className="h-full">
              <SpotlightCard className="h-full p-5">
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
        <Reveal delayMs={180}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="refx-sheen relative">
              <Link href="/games">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/support">Contact support</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
