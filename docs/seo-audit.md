# SEO audit — refx.gg (Phase 0)

Snapshot of the state found at the start of the SEO & Growth Engine build,
including items already shipped by the preceding growth sprint (same codebase,
earlier commits `e28840e`/`0db8968`).

## Stack

- **Web:** Next.js 16, App Router, React server + client components mixed.
  Marketing pages under `apps/web/app/(public)`; store under `(store)`;
  authenticated panel under `(dashboard)`/`(admin)` (out of scope).
- **Styling:** Tailwind + local shadcn-style components (`components/ui`),
  custom `refx-*` utility classes for the dark design system.
- **Data:** panel-api (NestJS) at `NEXT_PUBLIC_API_URL`; public catalog +
  KB endpoints used server-side via `lib/server-api.ts` (added earlier).
- **KB pipeline:** `KbArticle` table (markdown body, published flag) served by
  `/support/kb`; rendered by a dependency-free markdown renderer that works in
  RSC. Articles seeded via `database/seed/seed-kb.ts` (idempotent upsert).
- **Games catalog:** `GameTemplate` rows seeded from
  `database/seed/templates/*.json` (43 templates: 40 games + discord-bot +
  static-nginx + teamspeak3). Public detail: `/catalog/games/:slug`.
- **Deploy:** docker compose; web image bakes `NEXT_PUBLIC_*` at build.

## Current SEO state

| Item | State |
|---|---|
| robots.txt | ✅ `app/robots.ts` (panel routes disallowed, sitemap ref) |
| sitemap.xml | ✅ `app/sitemap.ts` — static routes + games + KB + modpacks, 15-min revalidate |
| metadataBase / canonical | ✅ root; per-page canonicals on KB, games, modpacks |
| Per-page titles/descriptions | ⚠️ present on KB/games/modpacks; **missing on voice, web-hosting, bots, team, games index, home (inherits default)** |
| OpenGraph/Twitter | ⚠️ OG on KB/games/modpacks; no OG images anywhere |
| JSON-LD | ✅ Organization (root), Product+AggregateOffer (games), TechArticle (KB), Product+FAQPage (modpacks). ❌ WebSite+SearchAction, HowTo, BreadcrumbList |
| lang attribute | ✅ `<html lang="en">` |
| 404 | ✅ `app/not-found.tsx` (correct status) |
| KB rendering | ✅ server-rendered (fixed earlier — was client-only, invisible to crawlers) |
| Performance | ✅ perf-lite mode for software rendering; fonts via next/font; external pack icons use plain `<img>` (acceptable; remote domains not configured for next/image) |

## Verified product claims (allow-list for all generated copy)

Instant provisioning after payment · live console · file manager + SFTP ·
one-click & scheduled backups (Essentials/Full; offsite "Express" add-on) ·
crash auto-restart · schedules (restart/command/backup) · sub-users with
granular permissions · **game switching that keeps address/backups/billing** ·
Minecraft: one-click CurseForge/Modrinth installs with client-mod stripping,
loader switcher (Vanilla/Paper/Fabric/Forge/NeoForge), live player list ·
Steam Workshop installs on supported games · paid vanity subdomains ·
dedicated RAM (no oversell) + burst CPU · DDoS protection (existing site
claim) · iOS app (App Store badge on site).

**Never claim:** uptime percentages, support SLAs, refund terms beyond
/refunds, per-server databases (feature-flagged), competitor prices.

## Gaps this build closes

1. Metadata + OG images for every remaining public page (Phase 1).
2. WebSite/SearchAction, HowTo, BreadcrumbList structured data (Phases 1/2/4).
3. Unique per-game landing content — current game pages show catalog data but
   no game-specific editorial, specs tiers, setup steps, or FAQ (Phase 2).
4. Competitor comparison pages — none exist (Phase 3).
5. Tutorial library — 6 articles exist; brief's 25-list has 3 overlaps, so
   ~22 to write (Phase 4).
