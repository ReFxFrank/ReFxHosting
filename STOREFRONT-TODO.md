# ReFx Public Storefront — status & next steps

_Last updated: 2026-06-16. Working branch: `main`._

## ✅ Done & pushed to `main`

**Phase 1 — data model** (`schema.prisma`, migration, shared enums, seed)
- `GameTemplate` storefront fields: `isPublished` (opt-in), `featured`, `sortOrder`,
  `longDescription`, `cardImageUrl`, `heroImageUrl`, `iconUrl`, `tags[]`.
- New `HomepageAlert` model + `HomepageAlertType` (separate from internal `GlobalAlert`).
- Seed publishes first-party eggs with preset art (backfill only touches rows with no
  art, so admin edits persist).

**Phase 2 — backend API** (panel-api; 144 unit tests green)
- Public (no auth): `GET /catalog/games`, `GET /catalog/games/:slug` (404 when unpublished),
  `GET /catalog/homepage-alerts`. Strict field whitelisting (no install scripts / secret vars / node internals).
- Admin: `/admin/homepage-alerts` CRUD; template storefront fields accepted in `PATCH /admin/templates/:id`.

**Phase 3 — public web** (`apps/web`; `tsc` + `next build` green)
- `/` is now the public homepage (deleted the old dashboard redirect). `(public)` route group
  with `PublicLayout` (auth-aware header/footer).
- Homepage: hero, homepage-alert banner, category tabs + search + live game grid, feature cards.
- `/games` catalog and `/games/[slug]` detail (hero, plans, locations, about).
- Preset art with fallback to `/games/presets/default.svg`.
- Order wizard preselects from `/order?game=<slug>&plan=<slug>` — reuses existing checkout/billing/provisioning.
- Logged-in users see "Client Area" → `/dashboard` (unified account, already satisfied).

## 🚀 Deploy on the VPS to see it live
```bash
git pull origin main
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build migrate panel-api web
```
- `migrate` applies the storefront migration and re-seeds (publishes seeded eggs).
- Then open `/` — the public storefront. (Admins can't edit storefront metadata from the
  UI yet — that's Phase 4 below; until then it's editable via the API or DB.)

## ⏭️ Next — Phase 4: admin UI ✅ DONE (commit pending push)
- [x] **Admin → Templates**: storefront section (publish/feature/sort, long
      description, tags, card/hero/icon images w/ preset picker + custom URL, live
      card preview) + inline Publish toggle & Featured badge in the table.
- [x] **Admin → Homepage alerts**: full CRUD page at `/admin/homepage-alerts`
      (type incl. PROMO, schedule, CTA, dismissible, priority, active) linked from
      the admin hub `QUICK_LINKS`, distinct from the internal "Alerts" tile.

## 🧪 Testing / polish
- [x] **Automated E2E** for the public API (`catalog.e2e-spec`): games list, game
      detail (404 when unpublished, allowed-plan filtering, safe-field whitelist),
      homepage alerts. (Suite now 47 e2e + 144 unit green.)
- [x] **Fixed** `?next` query preservation through login/register so the
      storefront → `/order?game=&plan=` preselection survives account creation.
- [x] **Fixed** pre-existing e2e breakage (ServersService missing
      MinecraftResolverService in servers/auth specs).
- [ ] **Live browser pass on the VPS**: homepage → game → `/order` (preselected)
      → register-at-checkout → server provisions → shows in `/servers`.
      (Couldn't run a real browser in the build container — needs the live stack.)
- [x] Mobile/responsive pass (scrollable category tabs, touch-visible card CTA,
      full-width hero/detail CTAs, plans-before-about on mobile). tsc + build green.
- [x] Richer categories (Survival/Modded/Sandbox/Simulation/Roleplay/FPS) +
      cohesive per-category preset art + per-game tags & long descriptions.
      Re-seed on the VPS to apply (migrate service re-runs the seed).

## ✅ Unified Minecraft (done)
- Single `minecraft` egg; loader (vanilla/paper/fabric/forge/neoforge) + version chosen
  post-purchase via Settings → Minecraft card (`PATCH /servers/:id/minecraft`). Old per-loader
  eggs hidden (kept for existing servers). Re-seed on the VPS to apply.

## ✅ Modrinth mods & modpacks (done)
- **Mods/plugins:** `ModsService` + routes (`GET …/mods/search|versions|installed`,
  `POST …/mods/install`, `DELETE …/mods/:file`) wired into ServersModule; **Mods** tab
  in the server UI. Loader derived from the server's `LOADER` env var (fallback to
  template slug); target dir `plugins/` for paper, else `mods/`.
- **Modpacks:** `ModpackService` + `ModpackProcessor` (background `MODPACK` queue).
  Install parses the `.mrpack`, derives the required MC version + loader (+loader
  version) from `modrinth.index.json` dependencies, switches the server
  (`ServersService.applyMinecraftEnv`), reinstalls (worlds preserved), clears stale
  mods, then downloads every server-side mod + applies config overrides. **Modpacks**
  server tab (search → pick version → background install + completion notification).
  Routes: `GET …/modpacks/search|versions`, `POST …/modpacks/install`. Uses `fflate`
  for zip parsing; Quilt packs not yet supported; per-file 30 MiB agent-upload cap.

## ✅ Platform work shipped 2026-06-16
- **Custom RBAC** — `Role` model + granular admin-permission catalog,
  `AdminPermissionGuard`/`@RequirePerm`; owner-only **Roles & permissions** page
  (built-in roles editable except Owner, which always keeps `*`). Admin surface is
  permission-gated end-to-end; `support.*` permissions added.
- **Admin Support** — full ticket queue (reply, internal notes, status/priority,
  categorise, assign) + **categories (SLA) & canned-response** management.
- **Billing** — editable **products + per-interval pricing**; owner-only
  **payment-gateway/key editor** (encrypted at rest); Stripe **webhooks** wired
  (`invoice.paid`, `checkout.session.completed`, `payment_intent.succeeded`,
  idempotent); invoice void/delete.
- **Accounts** — contact/billing **address fields**; user **delete** frees the
  email (tombstone); soft-deleted accounts no longer resurrected on deploy
  (`seedOwner` bootstraps only when no owner exists; demo content behind `SEED_DEMO`).
- **Ops/UX** — separate customer vs admin areas; **forced dark theme** (light mode
  was unstyled); reverse-proxy hardening (`BIND_HOST` loopback binding +
  `TRUST_PROXY`); **self-healing migrations** (db-push fallback) + `AuthController`
  guard fix (the `/auth/me` 500 that blanked the panel); idle-session timeout.

## ✅ Order page (GPortal-style, done)
- Per-game cards → **slot slider** → **per-game configuration** (user-editable
  template variables: text/number/boolean/enum) → **billing duration**
  (weekly→annual) → **location** (only regions with an online node that has
  capacity) → live total. Provisions only after payment clears.
- PayPal `invoice_id` is unique per attempt (no more DUPLICATE_INVOICE_ID on retry).

## ⏭️ Possible next steps
- Stream/agent-side fetch for modpack files >30 MiB (lift the panel upload cap).
- Quilt loader support for modpacks.
- Hard-purge option for accounts with no billing history (today: soft-delete).

## Notes
- Existing dashboard/admin/billing/server/node functionality is untouched.
- If the homepage looks empty after deploy, the eggs likely aren't published — re-run the
  `migrate` service (re-seed) or publish via the admin UI. On an already-initialised box,
  set `SEED_DEMO=true` to re-seed demo content.
