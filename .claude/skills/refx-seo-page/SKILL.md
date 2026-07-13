---
name: refx-seo-page
description: Create, update, or audit refx.gg game landing pages and SEO content: keywords, page blueprint, JSON-LD schema, internal links, anti-thin-content rules. Use for ANY refx.gg marketing or SEO work.
---

# refx.gg SEO Pages

Programmatic per-game landing pages are the core of the refx.gg SEO strategy, and they have exactly one failure mode that matters: **30+ pages that are the same page with the game's name swapped in.** Google classifies that as thin, scaled content and it either doesn't rank or gets the whole domain suppressed. Everything below exists to prevent that outcome.

The bar to clear: each landing page should be worth reading *even if refx.gg didn't sell anything*.

## Project facts (the platform this skill runs against)

Verified against the repo. These pin down which files you edit and what the page is allowed to say.

- **Framework + repo path**: Next.js (App Router), `apps/web`. Marketing lives in the `(public)`
  route group (`apps/web/app/(public)/`). Per-game landing pages are already built for all ~40
  games. SEO plumbing is **native Next.js**, not a plugin: `apps/web/app/sitemap.ts` (dynamic,
  revalidates ~15 min) and `apps/web/app/robots.ts`; shared metadata via the `pageMetadata()`
  helper in `apps/web/lib/seo.ts` (canonical + OpenGraph + Twitter); per-route
  `opengraph-image.tsx` generators.
- **URL pattern (do NOT change it)**: game landing pages are **`/games/<slug>`**
  (`apps/web/app/(public)/games/[slug]/page.tsx`), where `<slug>` is the `GameTemplate.slug`.
  There are **no URL rewrites** — the SEO `<h1>`/`<title>` is templated `"<Name> Server Hosting"`
  but the URL stays `/games/<slug>`. The `/games` index and the sitemap both emit exactly
  `/games/<slug>`. Never migrate this to `/<game>-server-hosting` — it would cost rankings.
- **Where game data comes from** (read from source, never hardcode):
  - **Live from the panel API** — name, slug, specs, art, and **price** come from
    `GET /api/v1/catalog/games` and `/catalog/games/<slug>` (`StorefrontService`, backed by the DB
    `GameTemplate` + `HardwareTier` + `Price` rows). **Prices are never hardcoded in the frontend**
    and `startingPrice` is a real "from $X/mo" from the cheapest monthly `Price`.
  - **Editorial / SEO copy** — hand-written per game in **`apps/web/data/games/<slug>.ts`**
    (registry `apps/web/data/games/index.ts`, merged on the detail page via
    `apps/web/lib/game-content.ts`): `tagline`, `heroCopy`, `whyDedicated`, `recommendedSpecs`,
    `setupSteps`, `modSupport`, `FAQ`, `relatedGames`, `searchTerms`. **This module is where the
    "≥50% game-specific" content actually lives — it is the file you create/edit for SEO work.**
  - JSON-LD (`Product` + `AggregateOffer`, `HowTo` from `setupSteps`, `FAQPage`) is already emitted
    by `games/[slug]/page.tsx` — extend the data module, don't re-invent the schema.
- **Analytics + Search Console**: TODO(frank) — external accounts, repo can't know. (`sitemap.ts`
  and `robots.ts` are wired; `NEXT_PUBLIC_SITE_URL` defaults to `https://refx.gg`.)
- **Trust facts you're allowed to claim — the honest answer today is "none yet."** `docs/16-status.md`
  states the platform is a working foundation, explicitly **"not a finished, load-tested commercial
  SaaS."** So there is **no verified uptime %, customer count, years-operating, or review count** to
  claim yet. **Sell on product capability** — real measured specs, named mod ecosystems, one-click
  game switching, edge DDoS protection, backups — **not on social proof.** Do **not** emit
  `aggregateRating`/`review` schema or "trusted by N gamers" copy. TODO(frank): replace this line
  with real numbers once they exist — and only then may a page state them.

## Guardrails

- **Never fabricate trust signals.** No invented uptime percentages, no "trusted by 10,000 gamers," no fake review counts, no `aggregateRating` schema without real reviews attached to real customers. Fake review schema is a manual-action risk with Google and it is also just lying to customers. If you don't have the numbers yet, sell on the product instead.
- **Never advertise a price or spec you don't actually offer.** The Offer schema and the page copy must match the real pricing table.
- **Never publish a landing page for a game that isn't provisionable.** Selling a broken game is worse than not listing it. (`add-game` Phase 7 gates this.)
- **Never create a separate page for a close keyword variant.** "cheap X server hosting", "best X server hosting", and "X server hosting" are the same intent. One page. Separate pages cannibalise each other and both rank worse than one good page would have.
- **Never keyword-stuff.** If a sentence reads like it was written for a crawler, delete it.
- **Do not ship a page that fails the uniqueness rule below.** That rule is the whole point of this skill.

## The uniqueness rule

Every landing page splits into two kinds of content:

- **Templated** — DDoS protection, the control panel, backups, support, uptime. Identical across games. This is fine, and it is *supposed* to repeat.
- **Game-specific** — facts that are only true of this one game, and that a person who plays it would recognise as correct.

**At least half the body text must be game-specific**, and the game-specific content must lead — above the fold and in the first two content sections, before any templated block appears.

Game-specific content that is actually worth writing (all of it comes from `add-game`'s spec sheet, so it's real):

- What this game's server actually *is* and why people self-host it rather than using official/public servers
- Real RAM guidance tied to player count, from the measured table — "10 players on 4 GB, 25 players on 8 GB", not "our servers are fast"
- The mod/plugin ecosystem for *this* game, named: the loaders, the popular packs, how installing them works here
- Version/branch quirks — what breaks between versions, what people pin, whether mods lag behind releases
- The specific pain of running this game badly: what lags, what corrupts, what eats disk
- What "good" looks like: the settings experienced admins change first

If you cannot write 400 words of game-specific truth about a game, you do not understand it well enough to sell hosting for it. Go back to the spec sheet.

## URL and keyword conventions

- **One landing page per game**, on the pattern already used by the site (see project facts).
- **Primary keyword**: `<game> server hosting` — transactional intent, this is the money term.
- **Secondary terms** folded into the *same* page: `<game> dedicated server`, `host a <game> server`, `<game> server hosting <modifier>`.
- **Informational intent goes to tutorials, not landing pages**: `how to make a <game> server`, `how to install mods on <game>`, `<game> server.properties explained`, `best <game> mods`, `fix <error message>`. These are separate pages, they're the long-tail volume, and they exist to link *into* the landing page.
- **Error-message tutorials are gold.** Someone searching an exact crash string has a problem, and you have a support history full of solved ones (`server-triage/references/known-issues.md`). That's a content pipeline nobody else has. Write the fix honestly — a page that actually fixes someone's crash earns links.
- One `<title>` ≤ 60 chars, one meta description ≤ 155 chars, one `<h1>`, all unique across the site. Self-referencing canonical.

## Workflow

1. **Gather** — pull the game's spec sheet (`add-game`), real pricing, and the real feature list. If the spec sheet doesn't exist, stop: you'd be writing fiction.
2. **Research** — look at what the top 3 ranking pages for `<game> server hosting` actually cover, and what they *miss*. The gap is your page.
3. **Draft** — follow `references/page-blueprint.md` section by section. Game-specific content first.
4. **Schema** — add JSON-LD per the blueprint. Only claims that are true and visible on the page.
5. **Interlink** — see below. An unlinked page is an invisible page.
6. **QA** — run the acceptance criteria. Then actually read the page out loud. If it sounds like a template, it is one.

## Internal linking (non-negotiable)

- Landing page links **out** to ≥3 tutorials for that game.
- Every tutorial links **back** to the landing page (that's how the tutorials pass authority to the money page).
- Landing page links to 2–3 **related games** (same genre or same audience) — this is how a new game's page gets crawled and gets its first authority.
- Landing page is linked from the `/games` index and is in the sitemap.
- **Zero orphan pages.** If nothing links to it, it doesn't exist.

## Acceptance criteria

A page ships only when all of these are true:

- [ ] ≥50% of body text is game-specific and passes the "a player of this game would recognise this as correct" test
- [ ] Title ≤60 chars, meta description ≤155 chars, both unique site-wide, one H1
- [ ] JSON-LD validates (Rich Results Test) and contains **no** claim that isn't true and visible on the page
- [ ] Prices in schema and copy match the real pricing table exactly
- [ ] ≥3 outbound internal links to tutorials, ≥3 to related games; linked from `/games` index; in the sitemap
- [ ] Every stat on the page traces to something real (spec sheet, pricing table, or a fact from project facts)
- [ ] Passes Core Web Vitals budget; hero image sized and below-fold art lazy-loaded
- [ ] The game is actually purchasable and provisionable right now
- [ ] Read aloud without wincing

## Audit mode

When asked to audit rather than create, check the existing pages for the failure modes that actually kill programmatic SEO, in this order:

1. **Duplicate/near-duplicate body copy across games** — the killer. Diff the pages; anything above ~50% shared text is a rewrite candidate.
2. **Keyword cannibalisation** — two pages targeting the same intent.
3. **Orphan pages** — in the sitemap but linked from nowhere.
4. **Schema lying** — ratings without reviews, prices that don't match, FAQs not on the page.
5. **Pages for games that don't provision.**
6. Then, and only then, the small stuff: title lengths, alt text, heading order.

Report findings worst-first with the specific pages named. Don't hand back a list of 200 alt-text warnings while three pages are duplicates of each other.
