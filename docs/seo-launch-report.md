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

### Phase 3 — comparison pages (commit `f25727d`) — REMOVED

Built (6 competitor pages + hub, noindex-gated) and then **removed at
Frank's request** before ever being indexed — the feature was decided
against. The removal commit deletes the routes, data, sitemap wiring and
footer link. Nothing external ever linked to `/compare`.

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
3. **Google Search Console**: after deploy, Sitemaps → resubmit
   `https://refx.gg/sitemap.xml` (it now carries the game pages with fresh
   metadata; KB articles appear once seeded). No other GSC action needed.
4. Optional: spot-read a handful of game pages (`/games/palworld`,
   `/games/rust`, `/games/factorio`) and KB tutorials for tone — every fact
   was grounded in the seed templates, but you know the games.

## 5-minute launch checklist

- [ ] `git pull` + rebuild/restart panel-api and web on the panel machine
- [ ] Run the KB seed command (item 2 above) — expect 28 "upserted" lines
- [ ] Open `/modpacks` → "How installs work" no longer 404s
- [ ] Open `/games/minecraft` — editorial band renders below the plans
- [ ] `curl -s https://refx.gg/sitemap.xml | grep -c knowledge-base` — >0
      after seeding

## Maintenance notes

- **Adding a game**: create `apps/web/data/games/<slug>.ts` (schema in
  `lib/game-content.ts`, copy rules in the header comment), add the import
  to `data/games/index.ts`. Ground every fact in the game's seed template.
- **Adding KB articles**: append to a batch file (or a new one imported by
  `seed-kb.ts`), re-run the seed. Markdown subset only — no tables, images
  or raw HTML (the renderer in `components/shared/markdown.tsx` is the
  contract).
- The style guardrails (no hype, no exclamation marks in prose, sentence
  case, US English, no uptime/SLA/refund/price claims) apply to all future
  content in these surfaces.
