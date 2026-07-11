/**
 * Competitor comparison content (/compare). Factually conservative by rule:
 * ReFx cells state only verified product capabilities (docs/seo-audit.md
 * allow-list); competitor cells are QUALITATIVE, based on each company's own
 * public marketing at a high level — "Advertised" / "Not advertised" — never
 * prices or invented specifics. Pages ship noindex until
 * NEXT_PUBLIC_INDEX_COMPARE=true (Frank reviews first).
 */

export interface CompareRow {
  feature: string;
  refx: string;
  them: string;
}

export interface Competitor {
  slug: string;
  name: string;
  intro: string;
  rows: CompareRow[];
  different: string[];
  whenThem: string;
  faq: { q: string; a: string }[];
}

/** Rows every page shares on the ReFx side (verified capabilities). */
const REFX_CORE: CompareRow[] = [
  {
    feature: "Switch your server to a different game",
    refx: "Yes — same server, address, backups and billing",
    them: "",
  },
  {
    feature: "Game + voice + web hosting on one invoice",
    refx: "Yes — one panel, one bill",
    them: "",
  },
  {
    feature: "One-click CurseForge & Modrinth modpacks",
    refx: "Yes — client-only mods stripped automatically",
    them: "",
  },
  {
    feature: "Backups",
    refx: "One-click + scheduled; offsite storage add-on",
    them: "",
  },
  {
    feature: "Crash auto-restart",
    refx: "Yes, with loop protection",
    them: "",
  },
  {
    feature: "Console, file manager, SFTP, schedules, sub-users",
    refx: "All plans",
    them: "",
  },
  { feature: "DDoS protection", refx: "All plans", them: "" },
  { feature: "iOS app", refx: "Yes", them: "" },
  {
    feature: "Open-source panel",
    refx: "Yes — AGPL, auditable",
    them: "",
  },
];

function withThem(them: string[]): CompareRow[] {
  return REFX_CORE.map((row, i) => ({ ...row, them: them[i] ?? "—" }));
}

export const COMPETITORS: Competitor[] = [
  {
    slug: "apex-hosting",
    name: "Apex Hosting",
    intro:
      "Apex Hosting is one of the best-known Minecraft hosts, with a large plan range, a customized Multicraft panel and years of reputation. This comparison focuses on where the two products differ in day-to-day server ownership.",
    rows: withThem([
      "Not advertised — new server per game",
      "Game servers only",
      "Advertised for Minecraft (their pack installer)",
      "Advertised (plan-dependent specifics)",
      "Not advertised",
      "Advertised (Multicraft-based panel)",
      "Advertised",
      "Not advertised",
      "No — proprietary panel",
    ]),
    different: [
      "The structural difference is the server model. On ReFx a server is a durable thing you own — you can move it from Minecraft to Palworld to Rust and keep the same address, backups and subscription. On per-game hosts, changing games generally means a new order.",
      "ReFx also folds voice servers and community web hosting into the same panel and invoice, where Apex focuses on game servers.",
    ],
    whenThem:
      "If you want a Minecraft-only host with a long public track record, phone support and a very large knowledge base, Apex is a reasonable, well-established choice.",
    faq: [
      {
        q: "Can I migrate a Minecraft server from Apex to ReFx?",
        a: "Yes. Download your world and configs (or grab them over SFTP), upload them to your ReFx server's file manager or SFTP, and start the server. Our world-transfer guide covers the exact folders.",
      },
      {
        q: "Does ReFx support modpacks the way Apex does?",
        a: "Yes — CurseForge and Modrinth packs install in one click, and ReFx additionally strips client-only mods automatically so packs boot on the first try.",
      },
      {
        q: "Is ReFx's panel really open source?",
        a: "Yes, the platform is AGPL-licensed and publicly auditable — you can read exactly how provisioning, backups and billing work.",
      },
    ],
  },
  {
    slug: "shockbyte",
    name: "Shockbyte",
    intro:
      "Shockbyte is a high-volume budget host known for low Minecraft prices and a broad game list. The honest comparison is less about price and more about what owning a server feels like month to month.",
    rows: withThem([
      "Not advertised — new server per game",
      "Game servers only",
      "Advertised for Minecraft",
      "Advertised (plan-dependent)",
      "Not advertised",
      "Advertised (Multicraft-based panel)",
      "Advertised",
      "Not advertised",
      "No — proprietary panel",
    ]),
    different: [
      "ReFx sells fewer, more complete plans: every plan includes the full panel — console, SFTP, scheduled and offsite-capable backups, sub-users, crash auto-restart — rather than gating capabilities by tier.",
      "Game switching is the other structural difference: your ReFx server survives your group's next game phase without re-buying and re-configuring.",
    ],
    whenThem:
      "If your only requirement is the lowest possible sticker price for a small vanilla Minecraft server, a budget host like Shockbyte can be the pragmatic choice.",
    faq: [
      {
        q: "Why is dedicated RAM worth paying for?",
        a: "Budget pricing is often built on oversold hardware. ReFx doesn't oversell RAM, and CPU is fair-share with burst headroom — your TPS doesn't depend on your neighbors' servers.",
      },
      {
        q: "Can I bring my world over?",
        a: "Yes — worlds, configs and plugin/mod folders transfer over SFTP in a few minutes. Our knowledge base has a step-by-step guide.",
      },
    ],
  },
  {
    slug: "bisecthosting",
    name: "BisectHosting",
    intro:
      "BisectHosting is a respected multi-game host with strong Minecraft roots, known for its budget/premium plan split. Both products take server ownership seriously; they differ in model and scope.",
    rows: withThem([
      "Not advertised — new server per game",
      "Game servers only",
      "Advertised for Minecraft",
      "Advertised (premium plans highlight backups)",
      "Not advertised",
      "Advertised (Multicraft-based panel)",
      "Advertised",
      "Not advertised",
      "No — proprietary panel",
    ]),
    different: [
      "ReFx has no budget/premium split — there is one tier of platform, and every plan gets all of it. The upsells that exist (offsite backups, custom subdomains) are storage and vanity, not core controls.",
      "And as everywhere in this series: a ReFx server can change games without a new purchase, which suits groups that rotate between survival games seasonally.",
    ],
    whenThem:
      "If you value a long-established brand with a large support organization and don't expect to switch games, Bisect's premium Minecraft plans are a solid, conventional choice.",
    faq: [
      {
        q: "Does ReFx have a budget tier with fewer features?",
        a: "No. Plans differ by resources (RAM/CPU/disk), never by panel features — the smallest plan has the same console, backups, schedules and sub-users as the largest.",
      },
      {
        q: "Can I run modpacks?",
        a: "Yes — one-click CurseForge and Modrinth installs with automatic client-mod stripping, plus a loader switcher for Vanilla/Paper/Fabric/Forge/NeoForge.",
      },
    ],
  },
  {
    slug: "g-portal",
    name: "G-Portal",
    intro:
      "G-Portal is a large European multi-game host whose Gamecloud lets customers move a server between supported games — the closest model to ReFx's game switching among the big hosts. The differences are in panel depth and openness.",
    rows: withThem([
      "Advertised (Gamecloud game switching)",
      "Game servers focus (voice varies by title)",
      "Varies by game/pack",
      "Advertised (limited retention on some titles)",
      "Not advertised",
      "Advertised (proprietary panel; depth varies by game)",
      "Advertised",
      "Advertised (app availability varies by region)",
      "No — proprietary panel",
    ]),
    different: [
      "Both platforms let a server change games, so the honest comparison is depth: ReFx pairs switching with a full owner's toolkit — real file manager and SFTP everywhere, scheduled plus offsite-capable backups, sub-user permissions, crash auto-restart, live console with player lists — uniformly across every game rather than varying by title.",
      "ReFx's panel is also open source (AGPL), so what the platform does with your server is inspectable rather than a black box.",
    ],
    whenThem:
      "If you want a very large game catalog from a long-established European brand and mostly play officially-supported console-adjacent titles, G-Portal is a legitimate option.",
    faq: [
      {
        q: "How is ReFx's game switching different from Gamecloud?",
        a: "Mechanically they rhyme. ReFx keeps the server's address, backups, sub-users and billing across the switch, and the same full panel applies to every game rather than varying by title.",
      },
      {
        q: "Do I keep my old game's files when I switch?",
        a: "Take a backup first — switching installs the new game cleanly. Backups survive the switch and you can restore or download the old game's data anytime.",
      },
    ],
  },
  {
    slug: "nitrado",
    name: "Nitrado",
    intro:
      "Nitrado is one of the largest game-server companies in the world and the official host for several console titles. It also offers game switching on its plans, so this comparison is between two switchable-server models.",
    rows: withThem([
      "Advertised (switchable game servers)",
      "Game + voice offerings exist",
      "Varies by game",
      "Advertised (varies by title)",
      "Not advertised",
      "Advertised (proprietary panel; depth varies by game)",
      "Advertised",
      "Advertised",
      "No — proprietary panel",
    ]),
    different: [
      "Nitrado's scale is real — official console partnerships, an enormous catalog. ReFx competes on the owner experience: a single modern panel with the same deep controls for every game, dedicated (non-oversold) RAM with burst CPU, backups you can schedule and ship offsite, and an open-source platform you can audit.",
      "For PC survival/sandbox communities that live in files, mods and schedules, that uniform depth is the practical difference.",
    ],
    whenThem:
      "If you need an official console server (e.g. for a console-only title) or a very large brand's catalog, Nitrado is often the required or safer choice.",
    faq: [
      {
        q: "Does ReFx host console versions of games?",
        a: "ReFx hosts PC dedicated servers. Crossplay works where the game itself supports it (e.g. Valheim crossplay), but console-exclusive server programs are the domain of official partners like Nitrado.",
      },
      {
        q: "What does open-source actually get me?",
        a: "Auditability and exit options: the AGPL platform means the panel's behavior is public, and your data (worlds, configs, backups) is always downloadable in standard formats.",
      },
    ],
  },
  {
    slug: "pebblehost",
    name: "PebbleHost",
    intro:
      "PebbleHost is a budget-focused host with a strong Minecraft community following. Like the other budget comparisons, this one is mostly about plan philosophy rather than a feature slugfest.",
    rows: withThem([
      "Not advertised — new server per game",
      "Minecraft-centric (other services vary)",
      "Advertised for Minecraft",
      "Advertised (plan/tier dependent)",
      "Not advertised",
      "Advertised (their own panel)",
      "Advertised",
      "Not advertised",
      "No — proprietary panel",
    ]),
    different: [
      "ReFx's position is simple: one class of plan with everything on, dedicated RAM, burst CPU, and a server that can outlive any single game your community plays.",
      "PebbleHost's budget tiers make different trade-offs to hit their price points; which is right depends on whether the server is a weekend experiment or your community's home.",
    ],
    whenThem:
      "For a throwaway or short-lived vanilla Minecraft server where price is the only criterion, a budget host is a rational pick.",
    faq: [
      {
        q: "What's the catch with very cheap hosting?",
        a: "Usually shared/oversold hardware and feature-gated tiers. Neither is dishonest — it's how the price is possible — but communities tend to outgrow it, and migrations cost evenings.",
      },
      {
        q: "How hard is moving to ReFx later?",
        a: "A world transfer is an SFTP download + upload and a restart. But if you expect to care about performance or mods within a few months, starting on the platform you'll end up on is cheaper in time.",
      },
    ],
  },
];

export const COMPETITOR_MAP = new Map(COMPETITORS.map((c) => [c.slug, c]));

/**
 * Comparison pages ship noindex (and out of the sitemap) until Frank reviews
 * the competitor claims and flips NEXT_PUBLIC_INDEX_COMPARE=true. Build-time
 * env — flipping it requires a web rebuild, like NEXT_PUBLIC_API_URL.
 */
export const COMPARE_INDEXABLE = process.env.NEXT_PUBLIC_INDEX_COMPARE === "true";

/** Month the competitor marketing claims were last reviewed by a human. */
export const COMPARE_REVIEWED = "July 2026";
