# SEO build plan (adaptation of the brief to this repo)

Already shipped pre-brief (kept, extended): robots/sitemap, server-rendered
KB + 6 articles, Org/Product/TechArticle JSON-LD, modpack landing pages,
referral system (Appendix A — live), attribution, abandoned-checkout email.

## Phase 1 — technical completions
- `apps/web/lib/seo.ts`: `pageMetadata()` helper (title ≤60, desc 140–160,
  canonical, OG/Twitter).
- Segment `layout.tsx` metadata for: home `(public)`, /games, /voice,
  /web-hosting, /bots, /team, /knowledge-base index.
- Dynamic OG images via `next/og`: branded root `opengraph-image.tsx` +
  `/games/[slug]` + `/knowledge-base/[slug]` variants.
- WebSite + SearchAction JSON-LD (KB search) on the public layout.
- BreadcrumbList on KB articles.

## Phase 2 — per-game content
- Types: `apps/web/lib/game-content.ts`.
- Data: `apps/web/data/games/<slug>.ts` × 40 (all templates except
  discord-bot/static-nginx/teamspeak3) + `index.ts` registry.
- Render: server sections on `/games/[slug]` beneath the existing
  order/detail client (hero copy, why-dedicated, specs tiers, setup steps
  (HowTo), mod support, FAQ (FAQPage), related games). Metadata enriched from
  searchTerms. Prices stay live from catalog — data files carry none.

## Phase 3 — comparisons
- `apps/web/data/compare/*.ts` (6 competitors, qualitative-only claims)
- `/compare` hub + `/compare/[slug]`; `NEXT_PUBLIC_INDEX_COMPARE` flag —
  noindex until Frank flips it. In sitemap only when flag on.

## Phase 4 — tutorials
- 22 new articles (25-list minus existing OOM / loader-comparison / modpack
  overlaps) appended via `database/seed/kb-articles-tutorials-*.ts`,
  seeded by the existing `seed-kb.ts`. Internal links: tutorial ↔ game page
  ↔ siblings. HowTo/TechArticle + BreadcrumbList JSON-LD.

## Phase 5 — QA + `docs/seo-launch-report.md`
Build, crawl new routes, JSON-LD spot checks, TODO(frank) list, launch
checklist. Commit per phase throughout.
