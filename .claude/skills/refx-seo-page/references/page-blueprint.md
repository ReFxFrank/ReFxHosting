# Landing page blueprint — `<game> server hosting`

Section order is deliberate. Game-specific content leads; templated blocks come after the reader is convinced you know the game. A page that opens with "99.9% uptime and DDoS protection" is indistinguishable from every competitor and gets bounced.

Word budgets are targets, not laws. Total ~1200–1800 words. Under ~800 words a programmatic page reads as thin.

---

## 1. Hero — templated shape, game-specific words (~60 words)

- **H1**: `<Game> Server Hosting` — exactly the primary keyword, nothing cute.
- One sentence that proves you know the game. Not "premium hosting" — something like "Run a modded <Game> server with <the specific loader> and mods installed from the panel." Name the thing this game's players actually care about.
- Price anchor: "from $X/mo" — must match the real cheapest tier.
- Primary CTA. Secondary CTA to the pricing table.
- No stock-photo gamer-with-headset. Use the game's own art (check the branding clause in the spec sheet first).

## 2. Why host your own `<Game>` server (~200 words, 100% game-specific)

The actual reason someone is on this page. Answer honestly for *this* game: control over settings, mods that public servers won't run, private world for friends, persistent world, no queue, admin tools, whatever is true. Different for every game — a Minecraft answer and a CS2 answer share nothing.

This section is what makes the page not-thin. Write it first.

## 3. What you need to run it (~250 words, 100% game-specific)

Straight from the spec sheet's measured resource table:

- RAM by player count — real numbers, in a small table
- What actually drives resource use in this game (chunk generation, entity count, mod count, tick rate, map size)
- Disk footprint and how fast it grows
- Whether the game is single-thread-bound (most are — say so, it's why clock speed matters more than core count)
- Version guidance: what people run, what to pin, what breaks

This section earns links, because it's the thing nobody else bothers to write and everybody searches for.

## 4. Mods / plugins on `<Game>` (~250 words, 100% game-specific)

- Named loaders and named popular packs — the ones this community actually uses
- How installation works on refx.gg specifically (workshop / one-click / upload / SFTP)
- Whether clients need matching mods (this is the single most common source of "can't connect", so it belongs on the sales page, not buried in docs)
- Link to the mod-install tutorial for this game

If the game doesn't support mods, say so plainly in one line and cut the section. Don't pad.

## 5. Plans and pricing (~100 words + table)

- Table generated from the real pricing source. Never hand-typed.
- Each tier annotated with the honest player-count guidance from the measured table, not the marketing one.
- The default/recommended tier is highlighted and is the one that actually works well — under-speccing the recommended tier to look cheap generates refunds.

## 6. Features (templated — this is where the repeated content goes, ~200 words)

The platform blocks: unified control panel, one-click game switching, DDoS protection, voice hosting, web hosting, backups, mod support, support response times.

Anchor each one to *this* game where you can — one clause is enough ("switch this server to any of our 30+ games without repurchasing"). A feature grid that's identical across 30 pages is acceptable; a feature grid that's the *majority* of the page is not.

## 7. Set it up in under X minutes (~150 words)

Numbered steps, real ones, for this game. Ends with the exact connect string format the customer will paste into the client. Link to the full getting-started doc.

## 8. FAQ (~250 words, mostly game-specific)

6–8 questions people actually ask about *this* game. Sources: your own support tickets, the game's subreddit, "People also ask".

Good: "Can I use my existing world?" "Do my friends need the same mods?" "How many players can 4 GB handle?" "Can I switch versions later?"
Bad: "Why choose refx.gg?" (that's not a question, it's an ad)

Answer honestly and specifically. Every FAQ item here must also appear in the FAQPage schema — and nothing may appear in the schema that isn't on the page.

## 9. Related games (templated shape)

2–3 games the same audience plays. Real editorial links, not a dump of all 30.

## 10. Final CTA

Price, button, one line. Done.

---

## Metadata

```
<title>{Game} Server Hosting | refx.gg</title>            <!-- ≤60 chars -->
<meta name="description" content="…">                     <!-- ≤155 chars, unique, mentions the game + one differentiator + price anchor -->
<link rel="canonical" href="https://refx.gg/…">           <!-- self-referencing -->
<meta property="og:title" …> <meta property="og:image" …>
```

One `<h1>`. Headings descend in order (no `<h2>` → `<h4>` jumps). Alt text on game art describes the art, not the keyword.

---

## JSON-LD

Emit `Product` + `Offer`, `FAQPage`, and `BreadcrumbList`. **Every value must be true and visible on the rendered page.**

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{Game} Server Hosting",
  "description": "…",
  "brand": { "@type": "Brand", "name": "refx.gg" },
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "lowPrice": "…",
    "highPrice": "…",
    "offerCount": "…",
    "availability": "https://schema.org/InStock",
    "url": "https://refx.gg/…"
  }
}
```

**Do not add `aggregateRating` or `review` unless real reviews exist**, are attached to real customers, and are displayed on the page. Fabricated review markup is a manual-action risk and it is straightforwardly dishonest. If there are no reviews yet, omit the property — an absent property costs you nothing; a fake one can cost you the domain.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question",
      "name": "…",
      "acceptedAnswer": { "@type": "Answer", "text": "…" } }
  ]
}
```

Only questions that are literally on the page, with the same answers.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Games", "item": "https://refx.gg/games" },
    { "@type": "ListItem", "position": 2, "name": "{Game} Server Hosting" }
  ]
}
```

---

## Performance

- LCP element is the hero text or a properly sized, preloaded hero image — never a lazy-loaded background
- Game art: modern format, explicit width/height (no layout shift), lazy below the fold
- No render-blocking third-party scripts above the fold
- The page must be readable and the CTA clickable before any JS hydrates

---

## Tutorial pages (the long tail)

Same rules, different shape. One tutorial = one specific problem, solved completely.

- Title matches the search query as closely as honest English allows: `How to Install Mods on a <Game> Server`, `Fix: <exact error string>`
- Solve the problem in the first screen. Do not make someone scroll past 600 words of preamble to reach the fix — that's the pattern that makes people hate SEO content, and it's a bounce.
- Then explain *why*, for the people who want it.
- Link back to the landing page once, naturally, where it's actually relevant.
- Error-fix tutorials come from `server-triage/references/known-issues.md`. Every solved ticket is a page.
