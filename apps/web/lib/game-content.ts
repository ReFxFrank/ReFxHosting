/**
 * Editorial content for the per-game landing pages (/games/[slug]) — the
 * substance that makes each page genuinely unique rather than a keyword-swap
 * template. One module per game under apps/web/data/games/; the registry in
 * that folder's index.ts maps slug → content.
 *
 * Copy rules (docs/seo-audit.md has the full claim allow-list): confident and
 * technical, no hype adjectives, no exclamation marks, sentence-case
 * headings, US English, no uptime/SLA/refund promises, no prices (pricing
 * renders live from the catalog).
 */

export interface GameSpecTier {
  /** e.g. "1–5 friends", "10–20 players", "Large community" */
  players: string;
  ram: string; // e.g. "4 GB"
  cpu: string; // e.g. "2 vCPU"
  storage: string; // e.g. "10 GB SSD"
  note?: string;
}

export interface GameFaqItem {
  q: string;
  a: string;
}

export interface GameContent {
  slug: string;
  /** Short positioning line under the H1. */
  tagline: string;
  /** 2–3 unique sentences of real game knowledge — no shared boilerplate. */
  heroCopy: string;
  /** 3–4 bullets: why a dedicated server beats peer-to-peer/local for THIS game. */
  whyDedicated: string[];
  /** 2–3 tiers, small → large. */
  recommendedSpecs: GameSpecTier[];
  /** 4–6 ReFx-specific steps: order → provision → connect (with real ports/paths). */
  setupSteps: string[];
  /** Mods/plugins/workshop story for this game; null when not applicable. */
  modSupport: string | null;
  /** 5–7 genuinely game-specific Q&As (ports, saves, wipes, crossplay, versions…). */
  faq: GameFaqItem[];
  /** 3–4 related template slugs. */
  relatedGames: string[];
  /** Primary + secondary search phrases; primary drives metadata. */
  searchTerms: string[];
}
