# SEO & growth engine — launch report

Build executed 2026-07-11 per the "SEO & Growth Engine Build Brief"
(docs/seo-build-plan.md). Everything below is on `main`. Companion docs:
docs/seo-audit.md (Phase 0 audit + the verified claim allow-list every page
was written against).

## What shipped

### Phase 1 — technical foundation (commit `cefe715`)

- `lib/seo.ts` metadata helper: unique title, description, canonical,
  OpenGraph + Twitter card on every marketing surface.
- Home page split into a server shell (crawlable metadata) + `HomeClient`.
- Section metadata for `/games`, `/voice`, `/web-hosting`, `/bots`, `/team`,
  `/knowledge-base` via passthrough layouts.
- Branded OG images (next/og, no external deps): site-wide default plus
  dynamic per-game and per-KB-article images.
- `WebSite` + `SearchAction` JSON-LD site-wide (KB search as the site search
  action); `BreadcrumbList` on KB articles.

### Phase 2 — game landing pages (commits `0c5f839`, `c2227ce`)

- `lib/game-content.ts` schema + `data/games/<slug>.ts` × **40** — one module
  per hosted game, each with unique tagline, hero copy, why-dedicated
  bullets, 3 spec tiers bracketing the template's real `recMemoryMb`, 4–6
  ReFx-specific setup steps with the game's real ports/config paths, a mod
  story matched to `supportsWorkshop`, 5–7 game-specific FAQs, related
  games, search terms.
- `components/public/game-editorial.tsx` renders the band below the
  interactive detail; `games/[slug]` emits `HowTo` + `FAQPage` JSON-LD and
  searchTerms-enriched metadata.
- Registry (`data/games/index.ts`) is static imports — content ships in the
  build, no API dependency.

### Phase 3 — comparison pages (commit `f25727d`)

- `/compare` hub + 6 pages: Apex Hosting, Shockbyte, BisectHosting,
  G-Portal, Nitrado, PebbleHost.
- Factually conservative by construction: ReFx cells state only allow-list
  capabilities; competitor cells are qualitative ("Advertised" / "Not
  advertised"), no prices, no invented specifics; G-Portal's Gamecloud and
  Nitrado's switchable servers are acknowledged honestly; every page has a
  "when they might fit better" section and a last-reviewed note with a
  correction CTA.
- `FAQPage` + `BreadcrumbList` JSON-LD; "Compare hosts" footer link.
- **Ships `noindex, follow` and excluded from the sitemap** until
  `NEXT_PUBLIC_INDEX_COMPARE=true` (see TODO list).

### Phase 4 — knowledge-base tutorials (commits `f4c2ed9`, `18fdbec`)

- 22 new long-form articles (≈800–1,000 words each) on top of the original
  6 — **28 total**, all seeded by `database/seed/seed-kb.ts` (idempotent,
  duplicate-slug guarded).
- Batch A: modded-MC setup (Medieval MC, ATM10, Better MC), RAM sizing,
  world transfer, Aikar's flags, registry-mismatch debugging, home-hosting
  economics, DDoS, schedules, sub-user access.
- Batch B: per-game setup guides (Palworld, Rust, Valheim, ARK, Enshrouded,
  Zomboid, 7DTD, Satisfactory), game switching, TeamSpeak, SRV records.

### Phase 5 — verification (this commit)

| Check | Result |
| --- | --- |
| `npm run build` (web, production) | exit 0 |
| `npm run typecheck` (web) | clean |
| panel-api jest | 523/523 pass |
| `/compare`, `/compare/[slug]` crawl | 200; invalid slug 404 |
| compare `noindex, follow` + sitemap exclusion (flag off) | confirmed |
| JSON-LD spot checks (WebSite/SearchAction, FAQPage, BreadcrumbList, Product, HowTo) | present |
| `/opengraph-image` | 200 `image/png` |
| game pages with panel API down | 200, graceful fallback |
| KB seed set | 28 articles, unique slugs, markdown-subset clean |
| Claim guardrail scan (uptime %/SLA/refunds/prices/hype) | pass — only flagged items are quoted error strings and generic electricity math |

## TODO(frank) — the human items

1. **Deploy panel + web** (usual pull + rebuild). `NEXT_PUBLIC_SITE_URL`
   should be `https://refx.gg` in the web build env if it isn't already.
2. **Seed the knowledge base** (fixes the modpacks "How installs work" 404
   and publishes all 28 articles):
   ```bash
   cd ~/ReFxHosting && git pull
   DATABASE_URL="postgresql://refx:refx@127.0.0.1:5432/refx?schema=public" \
     npx tsx database/seed/seed-kb.ts
   ```
3. **Review the comparison pages** at `/compare` (they're live but noindex).
   Read all 6 with a competitor-claims eye — the copy only says
   "advertised/not advertised", but you own the risk. When happy, set
   `NEXT_PUBLIC_INDEX_COMPARE=true` in the web build env and **rebuild the
   web image** (build-time var, same rule as `NEXT_PUBLIC_API_URL`). That
   single flag flips the robots meta to indexable AND adds the 7 URLs to
   the sitemap.
4. **Google Search Console**: after deploy, Sitemaps → resubmit
   `https://refx.gg/sitemap.xml` (it now carries the game pages with fresh
   metadata; KB articles appear once seeded). No other GSC action needed.
5. Optional: spot-read a handful of game pages (`/games/palworld`,
   `/games/rust`, `/games/factorio`) and KB tutorials for tone — every fact
   was grounded in the seed templates, but you know the games.

## 5-minute launch checklist

- [ ] `git pull` + rebuild/restart panel-api and web on the panel machine
- [ ] Run the KB seed command (item 2 above) — expect 28 "upserted" lines
- [ ] Open `/modpacks` → "How installs work" no longer 404s
- [ ] Open `/games/minecraft` — editorial band renders below the plans
- [ ] Open `/compare/apex-hosting` — page renders, view-source shows
      `noindex, follow`
- [ ] `curl -s https://refx.gg/sitemap.xml | grep -c knowledge-base` — >0
      after seeding
- [ ] Later, after reviewing /compare: flip `NEXT_PUBLIC_INDEX_COMPARE=true`,
      rebuild web, confirm the robots meta flipped

## Maintenance notes

- **Adding a game**: create `apps/web/data/games/<slug>.ts` (schema in
  `lib/game-content.ts`, copy rules in the header comment), add the import
  to `data/games/index.ts`. Ground every fact in the game's seed template.
- **Adding KB articles**: append to a batch file (or a new one imported by
  `seed-kb.ts`), re-run the seed. Markdown subset only — no tables, images
  or raw HTML (the renderer in `components/shared/markdown.tsx` is the
  contract).
- **Comparison pages**: re-review competitor claims every few months and
  bump `COMPARE_REVIEWED` in `data/compare/index.ts`; competitor cells must
  stay qualitative.
- The style guardrails (no hype, no exclamation marks in prose, sentence
  case, US English, no uptime/SLA/refund/price claims) apply to all future
  content in these surfaces.
