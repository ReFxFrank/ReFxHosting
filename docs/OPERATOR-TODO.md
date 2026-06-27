# Operator TODO — things to run on your machine / nodes

A living checklist of manual steps that can't be done from the codebase. Tackle when
you're at a machine. Grouped by where it runs. Check items off as you go.

Legend: **[panel]** = control/panel box · **[node]** = a game/web node (SSH) ·
**[dns]** = your DNS provider · **[github]** = repo settings.

---

## A. Deploy this session's fixes (do these first)

The game/agent fixes from this session reach servers in three steps:

- [ ] **[panel→node] Update the node agent to v1.1.7** — Panel → Nodes → each node →
      **Update node**. Brings the passwd fix, steamcmd bootstrap, and quote-aware
      startup splitting. Do this for **every** node (`refx-ca-east-bhs`,
      `refx-ca-east-bhs1`).
- [ ] **[panel] Reseed the templates** (writes the egg fixes into the DB):
      ```bash
      infra/scripts/dc run --rm --entrypoint sh migrate -c \
        "cd /repo && npx ts-node --transpile-only --project /repo/tsconfig.seed.json database/seed/seed.ts"
      ```
      (If `/repo` is baked into the migrate image rather than bind-mounted, run
      `git pull` then `infra/scripts/dc build migrate` first.)
- [ ] **[panel] Redeploy web + panel-api** so the new CPU gauges + any UI land
      (your normal compose up/rebuild).
- [ ] **[panel] Reinstall the affected game servers** (writes new install scripts:
      Rust launcher, steamclient.so for TF2/KF2/Mordhau/Satisfactory, config seeding
      for the 10 games, Arma 3). "Keep data" where offered → `validate` is fast.

### Smoke-test loop (per game, after the above)
- [ ] Rust ✅ (done) · Arma 3 ✅ (done) · TF2 ✅ (verified on node)
- [ ] ARK, Valheim, Palworld — start, confirm server name/password apply + boots
- [ ] Satisfactory, KF2 — confirm steamclient.so boot
- [ ] CS2 — start as-is; if it segfaults on `LD_LIBRARY_PATH`, tell me (I'll wrap it)
- [ ] The 10 config-seeded games (7DtD, Unturned, tModLoader, Mordhau, Squad, PZ,
      Conan, Astroneer, Enshrouded, ATS) — verify settings apply; **not yet
      node-verified**, so test before selling each.

---

## B. Web hosting (option 2) — setup when ready

Build progress lives in code; these are the env steps only you can do.

- [ ] **[panel] Generate + apply the web-hosting migration** (after pulling the
      schema change):
      ```bash
      npx prisma migrate dev --name web_hosting --schema database/prisma/schema.prisma
      # prod: npx prisma migrate deploy
      ```
- [ ] **[panel] Reseed** to load the web templates (the `static-nginx` template +
      its `WEB_HOSTING` product/tiers exist now; more to come) — same reseed as A.
- [ ] **[node] Smoke-test `static-nginx`** once a web node exists — provision it,
      confirm nginx serves `public/index.html` on the allocated port (not yet
      node-verified; nginx runs non-root with all paths under the data dir).
- [ ] **[node] Stand up a web node** — a box (new, or an existing node tagged for
      web) running the agent + **Caddy** as the reverse proxy on :80/:443. Install
      steps will be added to `infra/scripts/` (TBD this build).
- [ ] **[dns] Wildcard DNS for convenience URLs** — `*.apps.refx.gg` → the web
      node's IP (A/AAAA). Lets every new site go live instantly at
      `https://<shortId>.apps.refx.gg` before a custom domain is attached.
- [ ] **[dns] (per customer domain)** — customers point their domain's A/AAAA at the
      web node; the panel verifies + Caddy issues SSL automatically.
- [ ] **[node] Open ports 80 + 443** on the web node's firewall/security group.

---

## C. Misc / housekeeping (from earlier)

- [ ] **[github] Investigate the failing panel-api Docker image build** in the
      Release workflow (separate from agent self-update, which works). Only matters
      if you deploy the panel from ghcr images rather than building locally.
- [ ] **[github] Delete stale `claude/*` branches** if any remain.
- [ ] **[panel] Re-run `db:resync-tiers`** if you changed any egg's recommended specs
      and want existing tiers/prices resized (see docs/25).

---

_Keep this current — I'll add items here as the web-hosting build progresses._
