# ReFx Public Storefront — status & next steps

_Last updated: 2026-06-15. Working branch: `main`._

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
      homepage alerts. 45 e2e + 144 unit green.
- [x] **Fixed** `?next` query preservation through login/register so the
      storefront → `/order?game=&plan=` preselection survives account creation.
- [x] **Fixed** pre-existing e2e breakage (ServersService missing
      MinecraftResolverService in servers/auth specs).
- [ ] **Live browser pass on the VPS**: homepage → game → `/order` (preselected)
      → register-at-checkout → server provisions → shows in `/servers`.
      (Couldn't run a real browser in the build container — needs the live stack.)
- [ ] Mobile/responsive pass (homepage hero, game grid, detail two-column).
- [ ] Optionally add more `GameCategory` rows (currently survival/sandbox/shooter)
      + matching preset SVGs for richer category tabs.

## 🅿️ Parked (resume after storefront)
- **Modrinth mod browser.** Decision: Mods tab on **all** Minecraft servers (`mods/` for
  Fabric/Forge/NeoForge, `plugins/` for Paper). Mechanism already scoped: reuse the agent's
  binary-safe `/files/write` + `/files/mkdir` (NO agent rebuild) — add a panel endpoint that
  downloads a chosen Modrinth jar and streams the raw bytes to the agent write (sign over the
  exact bytes). Then a `Mods` tab in the server UI (search → install → list/remove).

## Notes
- Existing dashboard/admin/billing/server/node functionality is untouched.
- If the homepage looks empty after deploy, the eggs likely aren't published — re-run the
  `migrate` service (re-seed) or publish via the API/Phase-4 UI.
