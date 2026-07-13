---
name: add-game
description: Add, update, or audit a game in the refx.gg catalog end to end: licence check, specs, server definition, panel entry, pricing, docs, landing page, QA. Use for ANY game onboarding or config change.
---

# Add a Game to refx.gg

Adding a game is not "write an egg and ship it." A game is live only when a customer can buy it, boot it, connect to it, configure it, back it up, and find it on Google. This skill is the full checklist so nothing gets half-shipped.

## Project facts (the platform this skill runs against)

These are refx.gg's real conventions, verified against the repo. A game is defined once and inherits all of them.

- **Panel / orchestrator**: a custom platform (not Pterodactyl/Pelican) but **Pterodactyl-egg-compatible**. `apps/panel-api` (NestJS + Prisma + Redis/BullMQ) is the brain; `apps/node-agent` (Go) runs the servers. Games are the Prisma model `GameTemplate` (+ `TemplateVariable`), authored as egg-style JSON in **`database/seed/templates/<slug>.json`** and loaded by `database/seed/seed.ts` (create-only sync on every deploy: new eggs auto-import; install/startup/image/detect/stop/configFiles/specs/variables refresh; admin-tuned name/art/pricing/publish are preserved; deleted eggs are tombstoned in `RetiredEgg`). Templates are also CRUD-able at runtime via the admin panel (`apps/web/app/(admin)/admin/templates/`). A template models: `installScript` `{container,entrypoint,script}`, `startupCommand` (with `{{VAR}}`), `stopCommand` (default `^C`), `startupDetect` (the done-detection regex), `configFiles`, `dockerImages` (tag→image map), `steamAppId`, and `TemplateVariable` rows.
- **Container images (base-image convention)**: game eggs **reuse public community images** (Pterodactyl/parkervcp "yolks" + upstream), not a private ReFx registry. By family: **Java Minecraft** → Docker Hub `eclipse-temurin:21-jre` (install container `:21-jdk`); **SteamCMD games** → `ghcr.io/parkervcp/steamcmd:debian` (native Linux) or `:proton` (Windows-via-Proton) — these two cover most of the catalog; **runtime bots/apps** → `ghcr.io/parkervcp/yolks:<runtime>` (e.g. `nodejs_22`, `python_3.12`, `dotnet_8`); plus occasional upstream/game images (`ghcr.io/parkervcp/games:arma3`, `ghcr.io/pterodactyl/yolks:java_17`, `cm2network/cs2:latest`, `nginx:alpine`, `teamspeak:latest`). Put the image(s) in the egg's `dockerImages` tag→image map — and **copy the exact tag from an existing egg of the same family rather than guessing a tag that may not exist** (there is no `parkervcp/yolks:java_21`, for instance — Java uses `eclipse-temurin`). (ReFx's *own* images — panel-api/web/node-agent — live under `ghcr.io/refxfrank/refxhosting`; that's infra, not game images.)
- **Games catalog / metadata**: the `GameTemplate` row itself — `name`, `slug` (unique; it *is* the landing-page URL), `iconUrl`/`cardImageUrl`/`heroImageUrl` (default `/games/<slug>.svg` under `apps/web/public/games/`), `categoryId`→`GameCategory`, `tags[]` (free-form; **there is no separate alias field** — fold "7d2d"-style aliases into `tags`), `isPublished`, `featured`, `sortOrder`. The web storefront reads it live over REST: `GET /api/v1/catalog/games` → `StorefrontService.listGames`.
- **Customer docs**: a DB-backed Knowledge Base (Prisma `KbArticle`), authored in **`database/seed/kb-articles*.ts`** and seeded/published by **`database/seed/seed-kb.ts`**, served from panel-API `/support/kb`, rendered at `apps/web/app/(public)/knowledge-base/[slug]`. It is NOT a static docs framework. (The repo's `docs/` folder is internal engineering docs — a different thing.)
- **Marketing site + landing pages**: `apps/web/app/(public)/` — per-game landing page at **`/games/<slug>`** (server shell with metadata + JSON-LD, hand-written editorial in **`apps/web/data/games/<slug>.ts`**, registry `apps/web/data/games/index.ts`). Hand off to **`refx-seo-page`** — do not freehand it.
- **Plans / pricing**: fully DB-driven, seeded in `database/seed/seed.ts`. `Product` → `HardwareTier` (cpu/mem/disk) → `Price` (`amountMinor` cents + ISO currency + interval). Game tiers are **computed from the template's `recCpuCores/recMemoryMb/recDiskMb`**: Low (0.5×) / Mid (1×, recommended) / High (2×), priced `max($5, RAM_GB × $4/GB)` (`PRICE_PER_GB_CENTS=400`), memory clamped 1–14 GB, with interval discounts (quarterly −10%, semi-annual −15%, annual −20%). So getting the measured RAM in Phase 1 right *is* setting the price. Re-run `database/seed/reprice.ts` / `resync-tiers.ts` after spec changes.
- **Port allocation**: dynamic, from a **per-node pool** — `Node.allocationPortStart` (default 25565) … `allocationPortEnd` (default 25999), configurable per node. The panel assigns the lowest free port as the primary `Allocation` → `SERVER_PORT`, and **every `TemplateVariable` whose `envName` contains `PORT`** (QUERY_PORT, RCON_PORT, …) gets its own allocation from the same pool. So name your port variables `*_PORT` and reference `{{SERVER_PORT}}` etc. — never a literal port.
- **Backups**: the agent tars the server's data dir to `.tar.gz` (sha256'd), stored on **node local disk** for standard servers or **S3/R2** for "Express Backups" servers (one backend per backup — Express goes offsite *instead of*, not in addition to, local). It is an **exclude model** (`ignoredFiles`), not include — everything is kept unless excluded. Per-game excludes are **code-defined in `apps/panel-api/src/backups/backup-profiles.util.ts`** (keyed off template slug; `GENERIC_EXCLUDES` + `MINECRAFT_EXCLUDES`), applied in ESSENTIALS mode. So the Phase 3 "exclude caches/logs/depots" step means adding a profile there, not a template field. Backups cover the **filesystem only** — an attached MySQL DB is not in the archive.
- **Staging**: **there is none.** No staging compose profile, no staging env, no deploy pipeline (`docs/12-cicd.md` describes an aspirational one that isn't built). Provision your test server on prod through an internal account (see `refx-deploy`'s canary-provision flow). Treat "boot a real server" as "boot it on prod, quietly."

## Guardrails

- **Never bake game server binaries into the container image.** Download them at install time (SteamCMD, official installer, mod CDN). Baking them in is a redistribution-licensing problem, bloats images, and forces an image rebuild on every game patch.
- **Never invent specs.** RAM floors, port numbers, and player-count guidance must come from official docs or a measurement on a real test server. A wrong RAM default becomes a support ticket for every customer who buys that game. If a number can't be verified, mark it `TODO(frank)` and stop — do not guess.
- **Never hardcode ports.** Every port (game / query / RCON / extra) is a variable so the allocator can assign them.
- **Never commit secrets.** Steam credentials, API keys, and mod-CDN tokens go in the secret store, never in an egg, install script, image, or repo.
- **Never publish the landing page before a test server boots and accepts a client connection.** Selling a game that doesn't provision is worse than not listing it.
- **Stop and ask Frank** if the license gate (Phase 0) is ambiguous. Do not proceed on a "probably fine."

## Phase 0 — License and viability gate

Do this before writing a single line of config. It's the only phase that can kill the whole effort.

1. Read the game's server EULA / license terms. Answer explicitly:
   - Does it permit **commercial, paid third-party hosting**? Some titles forbid it outright, some require a partner/licence agreement, some cap what you may charge.
   - May the server binaries be **downloaded and installed by an operator on the customer's behalf**, or must the customer supply them?
   - Does the dedicated server need a **Steam account with a game licence** (i.e. not `+login anonymous`)? If so, whose account, and does that violate Steam's ToS at scale?
   - Are there **branding restrictions** (can you use the game's name/logo on a pricing page)?
2. Check the demand side: is anyone actually searching for `<game> server hosting`? A game with no search volume and no community isn't worth 30 hours of onboarding.
3. Check the competition: which hosts already list it, at what price? If nobody lists a popular game, find out why — it's usually a licensing landmine.

**Acceptance:** a written go/no-go with the licence clause cited. If no-go, stop and report why.

## Phase 1 — Spec research

Fill in `references/game-spec-template.md` completely. Every field is something a customer or the panel will need.

Sources, in order of trust: official server docs → official wiki → the server binary's own `--help` / default config → community wikis. Never a random Reddit comment.

**Acceptance:** the spec sheet has no blank fields and no unverified numbers. Anything unverifiable is a `TODO(frank)` line, not a guess.

## Phase 2 — Server definition

Write the game definition (egg / service config) against the spec sheet.

- **Install script**: idempotent — safe to re-run on an existing server without destroying customer data. Reinstall must be able to repair a broken install without wiping saves, or must warn loudly that it will.
- **Startup command**: parameterised on RAM, ports, and the settings customers are allowed to change.
- **Variables**: every one gets a human label, a description, a default, and a validation rule. `SERVER_PORT`, `QUERY_PORT`, `RCON_PORT`, `MAX_PLAYERS`, version pin, and branch/beta if applicable.
- **Version pinning**: default to the latest stable release, but let the customer pin a version. Auto-updating to a release that breaks their mods is a top-tier support complaint.
- **Done-detection**: the log line the panel watches to mark the server "running" (e.g. `Done (12.345s)!` for Minecraft). Get this wrong and the panel reports a healthy server as starting forever.
- **Stop command**: the graceful shutdown command (`stop`, `quit`, `end`, `SIGINT`). A SIGKILL on a game server corrupts saves. This matters more than it looks.
- **Health/query**: which query protocol the panel uses to read player count and liveness (A2S for Source-engine games, SLP for Minecraft, HTTP, or none).

**Acceptance:** server installs from scratch, starts, reports "running" via done-detection, and stops gracefully with the save intact.

## Phase 3 — Panel integration

- Catalogue entry: display name, slug (used by the landing page — coordinate with `refx-seo-page`), icon/art, category, search tags/aliases (people search "7d2d", not "7 Days to Die").
- **Config-file editor mappings**: file paths + format (properties / ini / json / toml / yaml / xml) so the panel can render editable settings instead of dumping a raw text editor on the customer.
  - **Reality on refx.gg (know this before you design around it):** there is *no* structured config-file editor UI. Editable settings reach customers two ways — the **Startup tab's "Server variables"** (your `TemplateVariable` env values) and **raw file editing in the file manager**. The template's `configFiles` array is **currently not applied at all**: the agent *has* a renderer (`RenderConfigFiles` in `apps/node-agent/internal/server/installer.go` — it understands `{path, content, mode}` with `{{VAR}}` interpolation and does **not** implement the Pterodactyl `{path, parser, find}` format) but **nothing on the install path calls it**, so `configFiles` render nowhere today. So: expose the settings customers change as **`TemplateVariable`s** — that is the *only* working knob. Treat `configFiles` as aspirational; wiring the renderer (and the `parser/find` map) is platform work, not per-game work — flag it, don't hand-fake it per egg.
- **Game-switching compatibility** — this is a headline feature, so it gets tested, not assumed:
  - Can this game be switched into an existing container, or does it need a different base image?
  - What happens to the previous game's data on switch — preserved, archived, or destroyed? Whichever it is, the panel must say so *before* the customer confirms.
  - Switching away and back must not leave orphaned files that break a fresh install.
- **Backup include/exclude paths**: include saves, world data, configs, and mods. Exclude caches, logs, and re-downloadable binaries — otherwise every backup is 8 GB of SteamCMD depot and the customer's restore takes an hour.

**Acceptance:** game appears in the panel, config editor renders real settings, switch-to and switch-away both tested, backup produces a restorable archive that excludes junk.

## Phase 4 — Plans and pricing

- Map the spec sheet's RAM/CPU/disk floors to the existing tiers. If the game's floor doesn't fit any tier, that's a pricing decision — surface it to Frank, don't invent a tier.
- Set the **default plan** a buyer lands on. Under-speccing the default to look cheap generates refunds; over-speccing loses the sale. Use the measured RAM-at-N-players number from Phase 1.
- Note the disk footprint. Some games (Ark, ASA, Squad) are enormous and will blow a disk quota that's fine for Minecraft.

**Acceptance:** every tier offered for this game can actually run it at the advertised player count. Verify the *lowest* tier by booting it, not by arithmetic.

## Phase 5 — Customer docs

Minimum set, per game:
1. Getting started / how to connect (with the exact address format the customer will paste into the client).
2. Configuring the server (the settings people actually change: slots, difficulty, world seed, whitelist, password).
3. Installing mods/plugins — or an explicit "this game does not support mods" so nobody buys expecting it.
4. Common errors and fixes — seed this from `server-triage`'s known-issues file for this game.

Write for someone who has never opened a control panel. Every doc gets one screenshot or one copy-pasteable command, not a wall of prose.

**Acceptance:** a person who has never used refx.gg can go from purchase to connected client using only these docs.

## Phase 6 — Marketing surface

Hand off to the **`refx-seo-page`** skill for the landing page — do not freehand it here, or the page will drift from the template and the schema will be inconsistent.

Also required:
- Game appears on the `/games` index (no orphan pages).
- Added to the sitemap.
- Cross-linked from 2–3 related games' landing pages.
- Pricing page lists it.

**Acceptance:** landing page live, linked from the index, in the sitemap, and `refx-seo-page`'s own acceptance criteria all pass.

## Phase 7 — QA

Run every item in `references/qa-checklist.md` on a real provisioned server. Do not skip this because the config "looks right." Most game onboarding bugs only appear on second boot, on restart, or on reinstall.

**Acceptance:** the entire checklist passes on a server provisioned through the normal customer purchase path — not a hand-built one.

## Phase 8 — Ship

- Changelog entry.
- Announcement (Discord / social) — link the landing page, not the panel.
- Add the game to the monitoring dashboard so its provisioning failures are visible.
- Log the launch date so you can check search rankings for it in 60–90 days.

**Acceptance:** the game is purchasable by a stranger with no manual intervention from Frank.

## Output format

When this skill runs, report progress as a phase table so it's obvious what's done and what's blocked:

```
Game: <name>
Phase 0 License      ✅ permits paid hosting (EULA §4.2)
Phase 1 Spec         ✅ references/specs/<slug>.md
Phase 2 Definition   ✅ <path>
Phase 3 Panel        ⚠️  game-switching: data destroyed on switch — needs a confirm dialog
Phase 4 Pricing      ⛔ BLOCKED: 6 GB floor, cheapest tier is 4 GB — TODO(frank): new tier?
...
```

Never mark a phase ✅ that hasn't been verified against a running server.
