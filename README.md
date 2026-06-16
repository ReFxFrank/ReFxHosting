<div align="center">

<img src="apps/web/public/brand/refx-wordmark.png" alt="ReFx Hosting" width="380" />

# ReFx Hosting

### The open, multi‑OS **game & voice** server‑hosting platform — with GPortal‑style game switching

**Game servers** sell on configurable **hardware tiers** (Low · Mid · High). **Voice servers** (TeamSpeak 3) sell **per slot**. Customers buy a server **once** and swap between Minecraft, Rust, ARK, Valheim, Palworld, CS2, FiveM and more **without redeploying** — a production‑grade, self‑hostable alternative to **Pterodactyl**, **AMP**, and **GPortal** with an original cross‑platform node agent, recurring **Stripe + PayPal** billing, and a built‑in helpdesk.

<br/>

[![CI](https://github.com/refxfrank/refxhosting/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![Security](https://github.com/refxfrank/refxhosting/actions/workflows/security.yml/badge.svg)](./.github/workflows/security.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-0072FF.svg?style=flat-square)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-150_unit_·_47_e2e_green-0072FF?style=flat-square)](#-testing)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#-tech-stack)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](#-node-agent--apps-node-agent)
[![Next.js](https://img.shields.io/badge/Next.js%2014-000?style=flat-square&logo=next.js&logoColor=white)](#-web--apps-web)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)](#-panel-api--apps-panel-api)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](#-tech-stack)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](#-tech-stack)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](#-quick-start)

**<samp>Primary&nbsp;#0072FF</samp>** · Dark glassy control‑panel UI · One Go binary for Linux **and** Windows nodes

[Quick start](#-quick-start) · [Cheat-sheet](#-operator-cheat-sheet-this-box) · [Node setup](#️-setting-up-game-nodes) · [Architecture](#-architecture) · [Game switching](#-the-signature-feature-game-switching) · [Pricing model](#-how-pricing-works) · [API](#-api-reference) · [Docs](docs/00-index.md) · [Status](docs/16-status.md)

</div>

---

## ✨ Why ReFx Hosting

Most panels lock a server to one game. **ReFx treats the server as a durable, billable identity** — its `shortId`, SFTP login, backups, and subscription stay put while the game *software* underneath is swapped on demand. That's the model GPortal popularised, built here on an **original node agent** that runs games in **Docker _or_ as native processes** (the thing most panels can't do well) — identically on **Linux and Windows**.

Two product types, each with the right pricing model:

- 🎮 **Game servers → hardware tiers.** Customers pick a **Low / Mid / High** package (fixed RAM/CPU/disk, fully admin‑configurable, with an optional informational player count) — not priced by player slots.
- 🎙️ **Voice servers → slots.** **TeamSpeak 3** (the first voice product) is billed **per slot** on lightweight resources, with a simple slot selector.

| | |
|---|---|
| 🔁 **Game switching** | Stop → pick a new game → reinstall → play. Same server, same billing. |
| 🧩 **Docker _and_ native hosting** | One `Runtime` interface; games that hate containers run as resource-limited native processes (cgroups v2 / Windows Job Objects). |
| 🖥️ **True multi-OS** | A single Go binary runs on Ubuntu, Debian, AlmaLinux, Rocky **and** Windows Server 2022/2025. |
| 🎮 **Hardware‑tier game servers** | Each game sells on **Low / Mid / High** tiers — fixed RAM/CPU/disk packages, fully configurable in the admin panel (resources, price per cycle, recommended/default tier, display order, active toggle). The order page shows **tier cards**; customers **upgrade/downgrade between tiers** from the panel and resources re‑provision live. Player count is informational, never the billing basis. |
| 🎙️ **Slot‑based voice hosting** | **TeamSpeak 3** as a first‑class voice product: a **slot selector** (min/max/step, price per slot), lightweight provisioning, the purchased slot count passed to the container, and clear **Game vs Voice** labelling across the customer + admin panels. |
| 💳 **Billing built in** | Products, subscriptions, invoices, VAT/GST/US tax, **Stripe + PayPal** (both with **verified webhooks** + capture), auto‑renewal & dunning. **Recurring PayPal** uses the **Subscriptions API** (auto‑bills every cycle). **Two billing models per product** — hardware tiers _or_ per‑slot — with **server‑side price validation** (the backend recomputes every total; client prices are never trusted). **Weekly → annual** terms; **edit products, tiers _and_ per‑interval pricing** in‑panel; **owner‑only gateway/key editor** (encrypted at rest); **coupons**, **gift cards** and **account/store credit**, all stackable at checkout. |
| 🛟 **Helpdesk built in** | A full **admin ticket queue** — reply, internal notes, set status/priority, categorise, assign — plus manageable **categories (SLA targets)** and **canned responses**, and a knowledge base. Past tickets can be **archived (stored away)** or **permanently deleted**. |
| 🔐 **Enterprise auth + custom RBAC** | Argon2id, TOTP + WebAuthn, scoped API keys, audit logs. **Build your own roles**: an owner-only Roles page with a granular admin-permission catalog; the whole admin surface is permission-gated end-to-end (customers never see it). Per-server sub-user permissions too. A customer's servers stay **private to them + their sub-users** — staff don't see them in the client area and reach them only via the admin panel (gated on `servers.manage`); a **Customers** view lists accounts with active, paid services. |
| 🧱 **Eggs, evolved** | JSON-driven game templates — admins add new games with **zero code changes**: drop a JSON file in `database/seed/templates/` and it **auto-loads on the next deploy** (create-only), each game automatically getting a purchasable **hardware‑tier** product (Low/Mid/High). |
| 👥 **Public "Meet the team"** | A polished, admin‑curated **`/team`** page with an animated avatar group + member cards (name, title, bio, avatar, link). Curate it from **Admin → Staff**; dependency‑free, GPU‑friendly animations that match the glassy theme. |
| ⛏️ **One Minecraft, every loader** | Buy **Minecraft once**, then pick **Vanilla / Paper / Fabric / Forge / NeoForge** and the **exact version** any time from a dedicated **Minecraft** tab — the server keeps its identity. **Automatic JVM selection** per version means no `UnsupportedClassVersionError` boot crashes. |
| 🧩 **Mods _and_ modpacks** | Built-in **Modrinth** browser: **one-click install** of individual mods/plugins (loader/version-aware), **and a full modpack installer** that downloads a `.mrpack`, **auto-switches the server to the pack's Minecraft version + loader**, then provisions every mod and config. |
| 🔒 **Rootless game containers** | Game servers run as a non-root user (`uid 1000`), so you don't get the "running as root" warning and a compromised server can't run as root on the node. |
| 🔌 **Auto networking** | Every new server reserves a free port and wires it into the game's startup automatically; players connect at the **IP:port** shown right on the server page (one-click copy). |
| 🛠️ **Admin power tools** | Create servers straight from an egg (no SSH), manage & delete nodes, **start/stop/restart individual servers from the node view**, pick a node's **region from a dropdown**, and watch **live node CPU / RAM / disk / ping graphs** from heartbeats. |
| 🗂️ **Real file manager + live SFTP** | Browse, edit, upload, compress/extract files in the browser, or connect over **SFTP** — credentials you rotate in the panel propagate to the node **immediately** (no restart). |
| 🎨 **ReFx Glassy UI** | Dark, premium control-panel design (`#0072ff`) with a live `xterm.js` console that **survives page switches and refreshes**, real-time resource gauges, per-game storefront artwork, and **sessions that stay signed in across panel rebuilds**. |
| 📦 **Migrate in** | Importers for **Pterodactyl** (live), AMP & TCAdmin (scaffolded). |

> [!NOTE]
> **Project status — honest.** This repo is a **complete architecture + a verified, building foundation**, not a finished commercial SaaS. Every component builds/typechecks/tests/validates (**150 unit + 47 e2e tests green**, agent cross-compiles to 3 targets, schema validates). External-integration edges are marked `// TODO(impl)`. The exact implemented-vs-stubbed matrix lives in **[docs/16-status.md](docs/16-status.md)**, and the frontend↔backend route map in **[docs/17-integration-map.md](docs/17-integration-map.md)**.

> [!TIP]
> **Recently shipped:** **hardware‑tier game servers** (Low/Mid/High cards + admin tier editor) · **slot‑based voice hosting — TeamSpeak 3** · **tier upgrade/downgrade** from the panel · **recurring PayPal via the Subscriptions API** (auto‑bills each cycle) · **PayPal capture fix** (no more "could not resolve invoice" after paying) · **public "Meet the team" page** + admin staff curation · **invoices select‑all + bulk delete** (paid invoices protected) · **node ping** now distinguishes "agent alive but port blocked" from "offline" and self‑heals · **node‑agent TLS cert persists across restarts** (pins stay valid) · **smoother dialogs** (removed costly backdrop‑blur) · **coupons + gift cards + account/store credit** · **custom RBAC** + permission‑gated admin · **admin Support ticket queue** · **owner‑only payment‑gateway/key editor** · unified **one‑Minecraft** product with loader/version tab · built‑in **Modrinth** mods + **modpack installer** · **rootless** game containers · in‑browser **file manager** + live **SFTP** rotation · console that **persists across navigations & refreshes**.

---

## 🆚 How it compares

| | **ReFx** | Pterodactyl | AMP | GPortal |
|---|:---:|:---:|:---:|:---:|
| Open source | ✅ AGPL-3.0 | ✅ MIT | ❌ commercial | ❌ proprietary |
| **Game switching** (keep server, swap game) | ✅ | ❌ | ⚠️ reinstall | ✅ |
| **Hardware‑tier** game plans (Low/Mid/High) | ✅ | ⚠️ manual | ⚠️ manual | ✅ |
| **Voice hosting** (TeamSpeak, slot‑based) | ✅ | ❌ | ⚠️ | ✅ |
| **Native process hosting** (non-Docker) | ✅ | ❌ Docker-only | ✅ | ✅ |
| Docker hosting | ✅ | ✅ | ✅ | ✅ |
| Runs on **Windows** nodes | ✅ | ❌ | ✅ | ✅ |
| Runs on **Linux** nodes | ✅ | ✅ | ✅ | ✅ |
| Single-binary agent | ✅ Go | ✅ Go (Wings) | ⚠️ .NET | n/a |
| **Billing built in** | ✅ | ❌ (add-on) | ⚠️ basic | ✅ |
| **Helpdesk built in** | ✅ | ❌ | ❌ | ✅ |
| REST **+ GraphQL** API | ✅ | ⚠️ REST | ⚠️ RPC | ❌ |
| Self-hostable | ✅ | ✅ | ✅ | ❌ |

ReFx aims to combine **Pterodactyl's open, container-first panel**, **AMP's
native-process flexibility**, and **GPortal's game-switching + billing** in one
self-hostable platform. _(Comparison reflects typical out-of-the-box capabilities;
all four evolve.)_

---

## 🏗 Architecture

```mermaid
flowchart TB
    subgraph Client["🌐 Browser / API clients"]
        UI["Web Panel — Next.js 14"]
        API_C["REST / GraphQL clients"]
    end

    subgraph Central["🧠 Central Panel"]
        API["panel-api — NestJS<br/>REST /api/v1 · GraphQL · Swagger"]
        Q["BullMQ workers<br/>provision · backup · renew · suspend"]
        DB[("PostgreSQL")]
        R[("Redis")]
        S3[("S3 / MinIO<br/>backups + attachments")]
        OS[("OpenSearch")]
    end

    subgraph Nodes["🖥️ Game Nodes (Linux / Windows)"]
        A1["node-agent (Go)"]
        A2["node-agent (Go)"]
        A1 --- D1["Docker / native processes"]
        A2 --- D2["Docker / native processes"]
    end

    UI --> API
    API_C --> API
    API <--> DB
    API <--> R
    API <--> OS
    Q <--> R
    API -- "HMAC-signed HTTPS + WebSocket" --> A1
    API -- "HMAC-signed HTTPS + WebSocket" --> A2
    A1 -- "stats · logs · backups" --> API
    A1 --> S3
    A2 --> S3
```

The panel is the brain (auth, billing, orchestration); the agents are the muscle (running game servers). They speak a signed HTTPS control API plus a WebSocket protocol for live console and stats. Full detail in **[docs/01-architecture.md](docs/01-architecture.md)**.

---

## 🔁 The signature feature: game switching

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant API as panel-api
    participant Q as Queue
    participant Agent as node-agent
    User->>Web: Pick new game (Switch Game)
    Web->>API: POST /servers/:id/switch-game {templateId, preserveData}
    API->>API: assert server STOPPED
    API->>API: check product allowedTemplateIds whitelist
    API->>API: write GameSwitchLog (audit) + repoint template/image/startup/env
    Note over API: Server identity (shortId, SFTP, backups, billing) preserved
    API->>Q: enqueue reinstall(serverId)
    Q->>Agent: install new template (optionally wipe volume)
    Agent-->>API: install.output (live) → SWITCHING_GAME → OFFLINE
    API-->>Web: 202 Accepted (stream console)
```

The orchestration lives in [`apps/panel-api/src/servers/`](apps/panel-api/src/servers) and is covered by unit tests (`servers.service.switch-game.spec.ts`).

---

## 🎯 Supported games (seeded templates)

| | | | |
|---|---|---|---|
| ⛏️ **Minecraft** _(Vanilla · Paper · Fabric · Forge · NeoForge)_ | 🔫 Rust | 🦖 ARK: Survival Evolved | 🧟 DayZ |
| 🪓 Valheim | 🐾 Palworld | 💥 Counter-Strike 2 | 🚗 FiveM (GTA V) |
| 🏭 Satisfactory | 🌳 Terraria _(+ tModLoader)_ | 🧠 Project Zomboid | 🌅 7 Days to Die |
| 🪖 Arma 3 | 🪖 Arma Reforger | 🎖️ Squad | 🔧 Garry's Mod |
| 🎩 Team Fortress 2 | ⚔️ Mordhau | 🧟‍♂️ Killing Floor 2 | 🧛 V Rising |
| 🌫️ Enshrouded | 🗡️ Conan Exiles | 🚀 Astroneer | 🪂 Unturned |
| 🚚 American Truck Simulator | 🎙️ **TeamSpeak 3** _(voice · slot‑based)_ | | _+ add your own_ |

Each is a JSON template in [`database/seed/templates/`](database/seed/templates) — no code required to add a game; drop a file and it auto-loads on the next deploy. Game eggs get **hardware‑tier** products; voice eggs (e.g. `teamspeak3`) get a **slot‑based** product. See **[docs/10-game-templates.md](docs/10-game-templates.md)** and the requested-games backlog in **[docs/egg-backlog.md](docs/egg-backlog.md)**.

> **Minecraft, unified:** there's now a **single Minecraft product**. After buying, open the server's **Minecraft** tab to choose the loader — **Vanilla, Paper, Fabric, Forge or NeoForge** — and the **exact version** (resolved live from each project's API; Mojang's manifest for Vanilla), switching between them whenever you like without losing the server. The panel **auto-picks the right `eclipse-temurin` JVM** for the chosen version (Java 11 → 25), so newer releases boot without manual image fiddling, and loader builds can be pinned or left as `latest`/`recommended` (auto-resolved at install). On modded/plugin loaders, the **Mods** tab adds Modrinth search + one-click install.

## 💸 How pricing works

A `Product` has an explicit **billing model**, so different product types price the right way. The order page renders the matching UI automatically, and the **backend recomputes + validates every total** at checkout (product/tier active, tier belongs to product, slot within min/max/step) — **client‑sent prices are never trusted**.

### 🎮 Game servers — hardware tiers

Each game egg is auto‑seeded as a **`HARDWARE_TIER`** product with three configurable tiers. The seeded numbers are **starting defaults** sized around each template's *recommended* specs; edit resources, prices, the recommended tier, and order in **Admin → Products → (game) → Hardware tiers** (the seeder is create‑only and never overwrites your edits).

| Tier | RAM | vCPU | Disk | Notes |
|------|-----|------|------|-------|
| **Low** | ~½× rec | ~½× rec | ~rec | Entry‑level — small communities |
| **Mid** ⭐ | ~1× rec | ~1× rec | ~1× rec | Balanced — **recommended default** |
| **High** | ~2× rec | ~2× rec | ~2× rec | Premium — large / modded servers |

Customers pick a **tier card** at checkout and can **upgrade/downgrade** between tiers later (resources re‑provision live; billing adjusts next cycle). An optional **recommended player count** is shown for guidance only — it is **never** the billing basis.

### 🎙️ Voice servers — per slot

**TeamSpeak 3** is a **`PER_SLOT`** product: customers choose a slot count (min/max/step) and pay **price‑per‑slot × slots**. Resources are lightweight per‑slot values, and the purchased slot count is passed to the container (`TS3SERVER_MAX_CLIENTS` / `SLOTS`).

### 🗓️ Terms & recurring billing

Both models support **weekly · biweekly · monthly · quarterly · semi‑annual · annual** terms (longer terms discounted; sub‑month terms billed proportionally). Saved **Stripe cards** auto‑charge off‑session at renewal; **PayPal** uses the **Subscriptions API** so PayPal auto‑bills each cycle. **Coupons, gift cards and store credit** stack at checkout (card flow), charging only the remaining balance. All amounts are stored as **integer minor units (cents)**.

---

## 🧰 Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Panel API** | NestJS · Prisma · BullMQ | I/O-bound orchestration; REST **and** GraphQL in one app; TS types shared with the frontend |
| **Web** | Next.js 14 · TypeScript · Tailwind · shadcn/ui | App Router, dark-mode-first, Linear/Vercel-inspired |
| **Node agent** | **Go** (single static binary) | Trivial cross-compile, great concurrency, Docker SDK, no runtime to install |
| **Data** | PostgreSQL · Redis · OpenSearch · S3/MinIO | Relational integrity for billing; cache/queues; search; object storage |
| **Infra** | Docker Compose · Helm/K8s · GitHub Actions | Local → production with the same images; HPA + observability |
| **Observability** | Prometheus · Grafana · Loki | Metrics + dashboards + logs |

---

## 🧩 Components & key functions

### 🧠 panel-api — [`apps/panel-api`](apps/panel-api)
NestJS central panel. **Compiles clean & boots; 150 unit + 47 e2e tests green.**

| Area | Where | Notable functions / endpoints |
|------|-------|-------------------------------|
| Auth & MFA | `src/auth` | `register` / `login` (Argon2id), JWT access+refresh with **rotation + reuse detection**, `totpEnroll`/`totpVerify`, WebAuthn ceremonies, scoped + IP-allowlisted API keys |
| AuthZ | `src/auth/guards` | `RolesGuard` (global roles), `PermissionGuard` (per-server `SubUser` perms, owner/admin override, wildcard `files.*`) |
| Servers | `src/servers` | `POST /servers` (queues provisioning), power `start/stop/restart/kill`, `reinstall`, **`switchGame()`**, **`setMinecraftConfig()`** (loader + version), **Modrinth mod search/install**, **modpack installer** (`ModpackProcessor` — `.mrpack` → loader/version switch + mods/config), `resize()` (capacity-checked), variables/allocations/sub-users/schedules |
| Agent link | `src/agent` | `NodeAgentClient` (HMAC-signed calls), `ConsoleGateway` (browser ↔ agent WebSocket relay) |
| Billing | `src/billing` | **two billing models** (`HARDWARE_TIER` tiers + `PER_SLOT`), `HardwareTier` CRUD, server‑side price validation, `calculateTax()` (VAT/GST/US), invoice numbering, `StripeGateway`/`PayPalGateway` with **DB‑backed encrypted keys**, **Stripe + PayPal verified webhooks**, **recurring PayPal Subscriptions** (`ensurePayPalPlan`/`startPayPalSubscription`/`settlePayPalRecurringPayment`), renewal + dunning workers |
| Orders | `src/orders` | checkout orchestration: validate product/tier/slots, create subscription + first invoice, settle via gateway (or start a PayPal subscription), reserve‑then‑provision on payment |
| Support | `src/support` | **admin ticket queue** (reply/notes/status/priority/assign), **categories (SLA) + canned responses CRUD**, SLA breach computation, KB |
| AuthZ (custom RBAC) | `src/admin`, `src/common/permissions.ts` | `Role` model + granular admin-permission catalog, `AdminPermissionGuard` + `@RequirePerm`, owner-only Roles management |
| Platform | `src/platform` | audit query, notifications, global alerts, **staff/“team” content** (`StaffService`), encrypted settings store, `/health`, Prometheus `/metrics` |

```http
POST /api/v1/servers/{id}/switch-game
Authorization: Bearer <jwt>
Content-Type: application/json

{ "templateId": "0f9c…", "preserveData": false }
```

### 🖥️ web — [`apps/web`](apps/web)
Next.js 14 customer + admin panel. **Builds, typechecks & lints clean.**

- **Live console** — `xterm.js` wired to the panel WebSocket (`lib/ws.ts`), with power controls and live CPU/RAM/disk gauges (Recharts). A shared console hub keeps the socket + scrollback **alive across tab switches and full page refreshes** (`lib/console-hub.ts`).
- **Minecraft tab** — for Minecraft servers, pick the loader (Vanilla/Paper/Fabric/Forge/NeoForge) and exact version; switch any time.
- **Mods & Modpacks tabs** — Modrinth search with one-click install/remove of mods & plugins (loader/version-aware), plus a **modpack installer** that picks a `.mrpack` version and switches the server's MC version + loader for you (runs in the background with a completion notification).
- **File manager** — browse, edit, upload, compress/extract, permissions; now surfaces agent errors instead of silently showing an empty folder.
- **Order flow** — adapts to the product: **hardware‑tier cards** for game servers, a **slot selector** for voice (TeamSpeak 3); live location/node capacity, coupons/gift cards/credit, Stripe **or** PayPal.
- **Switch-game flow** — choose from the plan-allowed catalog with an explicit keep-vs-wipe data decision.
- **Upgrade** — move a game server **between hardware tiers** (or scale slots for voice) with a live price preview; resources re‑provision immediately.
- **Public Team page** + admin **Staff** curation — animated avatar group, dependency‑free reveal animations.
- **Separate customer & admin areas** — distinct layouts/nav; the entire `/admin` surface is **permission-gated** (server-enforced), so customers never see staff tooling.
- **Admin power tools** — create servers from an egg; manage nodes (region **dropdown** on create) with **per-server power controls**; **Products** with an inline **price editor**; an **owner-only Payments** page with a gateway/key editor; **Orders/Invoices** (void/delete); a **Support** ticket queue + categories/canned responses; a **Roles & permissions** builder; **Customers/Users** with full account view + delete.
- Sessions **stay signed in across panel rebuilds** (transient-tolerant token refresh + optional "keep me signed in"); an **idle-session timeout** prompts before logging out.
- Plus dashboard, backups, databases, schedules, billing, account/security, and a glassy **storefront** with per-game artwork, node-derived server locations, and a public **Meet the team** page.

### ⚙️ node-agent — [`apps/node-agent`](apps/node-agent)
Original Go daemon. **Cross-compiles to linux/amd64, linux/arm64, windows/amd64; vet + tests pass.**

The headline design — **one interface, multiple backends**:

```go
type Runtime interface {
    Install(ctx, spec) error
    Start(ctx, id) error;  Stop(ctx, id) error
    Kill(ctx, id) error;   Restart(ctx, id) error
    AttachConsole(ctx, id) (Console, error)   // stream stdout/err + write stdin
    Stats(ctx, id) (ResourceStats, error)
    Reconfigure(ctx, id, limits) error
    Destroy(ctx, id) error
}
```

- `DockerRuntime` — Docker SDK: image pull, resource-limited containers, log demux, live stats.
- `NativeRuntime` — `os/exec` with cgroups v2 (Linux) / Job Objects (Windows) limits, ring-buffer console fan-out. **The differentiator.**
- Plus a jailed file manager + SFTP server, tar.gz→S3 backups, signed control API, and a WebSocket hub.
- **Self‑signed TLS that persists across restarts** (stable fingerprint), so the panel's optional **certificate pinning** (`AGENT_TLS_PINNING`) keeps verifying after agent updates.

### 📦 shared / database / infra
- [`packages/shared`](packages/shared) — enums (mirror the schema), the panel↔agent WS protocol, permission strings, DTOs.
- [`database/prisma/schema.prisma`](database/prisma/schema.prisma) — the canonical data model (+ `0_init` migration + seed).
- [`infra/`](infra) — Docker Compose (profiled), Helm chart, and `install-node.sh`/`install-node.ps1`.

---

## 🚀 Quick start

```bash
git clone https://github.com/refxfrank/refxhosting.git
cd refxhosting

# One command: generates secrets, builds, migrates, seeds, brings up the stack
./infra/scripts/bootstrap.sh
```

| Service | URL |
|---------|-----|
| 🖥️ Web panel | http://localhost:3000 |
| 🔌 API + Swagger | http://localhost:4000/docs |
| 🔎 GraphQL | http://localhost:4000/graphql |
| 📊 Grafana _(`--profile full`)_ | http://localhost:3001 |

The default Compose profile is lean (~2 GB); add `--profile full` for OpenSearch + observability. The seed prints a default owner login (`owner@refx.example`).

> Deploying remotely? Set `NEXT_PUBLIC_API_URL=http://<host>:4000` in `.env` **before** building the web image (it's baked at build time). See **[docs/18-installation.md](docs/18-installation.md)**.

---

## 🧭 Operator cheat-sheet (this box)

Quick command reference for **this single-box deployment** — panel **and** a node
on the same host. Paths below reflect this server (user `claude`, repo at
`~/refxhosting`, agent running as **root**); adjust if yours differ.

### Where everything lives

| What | Path / value |
|------|--------------|
| Repo checkout | `/home/claude/refxhosting` |
| Compose stack | `infra/docker/docker-compose.yml` + `--env-file .env` |
| Panel services | `panel-api`, `web` (+ one-shot `migrate`) |
| Agent binary | `apps/node-agent/refx-agent` |
| Agent config | `/home/claude/refxhosting/node-agent.yaml` |
| Agent state _(root-owned)_ | `/var/lib/refx-agent` → the agent runs as **root** |
| Agent log | `/var/log/refx-agent.log` |

### One-liners (after I push changes)

```bash
# Update the panel (web + API) — rebuilds only the app containers, applies migrations
~/refxhosting/infra/scripts/update-panel.sh

# Update the node agent — rebuilds the Go binary + restarts it
~/refxhosting/infra/scripts/update-agent.sh
```

Both scripts `git pull` first. After updating the panel, **hard-refresh** the
browser (Ctrl/Cmd-Shift-R) — `NEXT_PUBLIC_API_URL` and the web bundle are baked
at build time.

### Manual equivalents

<details><summary><b>Panel</b> (web + panel-api)</summary>

```bash
cd ~/refxhosting && git pull origin main
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build panel-api web
# apply any new DB migrations (safe to always run):
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d migrate
```
</details>

<details><summary><b>Node agent</b> (runs as root, manual / no systemd)</summary>

```bash
cd ~/refxhosting && git pull origin main
cd apps/node-agent
go build -o ./refx-agent.new ./cmd/refx-agent     # build as your user (Go in your PATH)
sudo pkill -f refx-agent                          # stop the root agent
mv -f ./refx-agent.new ./refx-agent               # swap the binary (can't overwrite a running one)
sudo bash -c 'nohup /home/claude/refxhosting/apps/node-agent/refx-agent \
  --config /home/claude/refxhosting/node-agent.yaml > /var/log/refx-agent.log 2>&1 &'
```
</details>

### Recommended: run the agent under systemd

Install once; afterwards updates are a binary swap + `systemctl restart`, it
auto-restarts on crash, and it survives reboots:

```bash
cd ~/refxhosting
sudo cp infra/systemd/refx-agent.service.example /etc/systemd/system/refx-agent.service
# edit the two paths in the unit if your checkout isn't /home/claude/refxhosting
sudo pkill -f refx-agent || true        # stop the manual one
sudo systemctl daemon-reload
sudo systemctl enable --now refx-agent
sudo systemctl status refx-agent
```

Once installed, `update-agent.sh` auto-detects the unit and uses
`systemctl restart` for you.

### Status & logs

```bash
# Agent
pgrep -af refx-agent
sudo tail -f /var/log/refx-agent.log                 # manual launch
sudo journalctl -u refx-agent -f                     # systemd

# Panel
docker compose -f infra/docker/docker-compose.yml --env-file .env ps
docker compose -f infra/docker/docker-compose.yml --env-file .env logs -f panel-api
```

### Which rebuild do I need?

| I changed… | Do this |
|------------|---------|
| `apps/web` | `update-panel.sh` |
| `apps/panel-api` | `update-panel.sh` |
| `database/prisma/**` (schema or migration) | `update-panel.sh` _(rebuilds API **and** runs `migrate`)_ |
| `apps/node-agent` | `update-agent.sh` _(on the node box)_ |
| `packages/shared` | `update-panel.sh` _(rebuilds web + API)_ |

---

## 🧠 Setting up the panel (production & hybrid)

The **panel** is the central brain — `panel-api` (NestJS) + `web` (Next.js) backed
by PostgreSQL, Redis, and S3/MinIO. [Quick start](#-quick-start) gets it running
locally; this is the production-grade path plus the **single-box hybrid** layout.

### Step 1 — configure `.env`

`bootstrap.sh` generates a working `.env`, or copy `.env.example` and set at least:

```bash
# Secrets (generate strong values!)
SECRETS_ENC_KEY=<64 hex chars>          # openssl rand -hex 32  — AES-256-GCM key for secrets at rest
JWT_ACCESS_SECRET=<random>              # openssl rand -hex 48
JWT_REFRESH_SECRET=<random>

# Data stores (Compose service names work inside the network)
DATABASE_URL=postgresql://refx:refx@postgres:5432/refx
REDIS_URL=redis://redis:6379

# Object storage (MinIO ships in Compose; or point at real S3)
S3_ENDPOINT=http://minio:9000
S3_BUCKET=refx-backups
S3_ACCESS_KEY=...           S3_SECRET_KEY=...

# IMPORTANT: baked into the web bundle at BUILD time, not runtime.
# Set this to the URL browsers use to reach panel-api before building web.
# Its scheme MUST match the site's: an https:// page cannot call an http:// API.
NEXT_PUBLIC_API_URL=https://api.example.com

# Reverse-proxy hardening (recommended in production)
BIND_HOST=127.0.0.1          # publish container ports on loopback only; the proxy fronts them
TRUST_PROXY=1                # derive client IP from X-Forwarded-For (rate-limit/audit accuracy)
CORS_ORIGINS=https://example.com,https://www.example.com
PANEL_URL=https://example.com

# Optional: SMTP (email), STRIPE_*/PAYPAL_* (live billing)
# Demo content (sample regions/products/templates) only seeds on a first run;
# set SEED_DEMO=true to force it, or leave blank so deleted data isn't resurrected.
```

> ⚠️ `NEXT_PUBLIC_API_URL` is **compiled into the web image**. If you change it you
> must **rebuild** `web`, not just restart it. Behind SSL it must be **https** and
> point at the API host the browser uses (e.g. `https://api.example.com`).

> 💳 **Payment gateways** are best configured **in‑panel** (Owner → Payments — keys
> are encrypted at rest), or via env. Register your webhook endpoint at
> `POST /api/v1/billing/webhooks/stripe` and `…/paypal`. For **recurring PayPal**,
> enable these events on the PayPal app: `PAYMENT.SALE.COMPLETED`,
> `PAYMENT.CAPTURE.COMPLETED/REFUNDED`, and
> `BILLING.SUBSCRIPTION.CANCELLED/SUSPENDED/EXPIRED` — and verify the flow in
> **PayPal sandbox** before going live.

### Step 2 — build, migrate, seed, run

```bash
# Lean profile (panel-api + web + postgres + redis + minio):
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d --build

# Full profile adds OpenSearch + Prometheus/Grafana/Loki:
docker compose -f infra/docker/docker-compose.yml --env-file .env --profile full up -d --build
```

The `migrate` service applies Prisma migrations and seeds regions, game templates,
and a default **owner** login (printed in its logs — change the password on first
sign-in). Always pass `--env-file .env` so Compose uses *your* secrets, not the
built-in dev defaults.

### Step 3 — put it behind TLS

Run a reverse proxy (Caddy / nginx / Traefik) terminating HTTPS and routing to
the **loopback-bound** ports (`BIND_HOST=127.0.0.1`):

| Public host | → | Upstream |
|-------------|---|----------|
| `example.com`, `www.example.com` | → | `127.0.0.1:3000` (web) |
| `api.example.com` | → | `127.0.0.1:4000` (panel-api) |

A minimal **Caddyfile**:

```caddy
example.com, www.example.com { reverse_proxy 127.0.0.1:3000 }
api.example.com              { reverse_proxy 127.0.0.1:4000 }
```

Set `CORS_ORIGINS` to the web origins and `NEXT_PUBLIC_API_URL=https://api.example.com`
(rebuild `web` after). Caddy auto-upgrades the console WebSocket — no extra config.
Then browse to your domain and sign in as the seeded owner. `/health` and
`/metrics` are served at the **root** (not under `/api/v1`).

See **[docs/18-installation.md](docs/18-installation.md)** and
**[docs/19-production-deployment.md](docs/19-production-deployment.md)** for managed
databases, Helm/Kubernetes, and scaling.

### Hybrid: panel **and** a node on one box

For a single VPS that hosts both the panel and game servers, run the panel stack
above, then install the agent **on the same machine**:

1. Create the node in **Admin → Nodes → Add** with **FQDN = the box's public IP**
   (so the panel can reach the agent's `:8443` *and* players can reach game ports).
2. Install the agent (see [node setup](#️-setting-up-game-nodes)) pointing at the
   panel over loopback:

   ```bash
   sudo bash install-node.sh --panel-url http://127.0.0.1:4000 --token <BOOTSTRAP_TOKEN>
   ```

   The agent → panel calls go over loopback (`127.0.0.1:4000`); the panel → agent
   calls use the node FQDN you set (`<public-ip>:8443`).
3. The Compose panel already runs with `NODE_TLS_REJECT_UNAUTHORIZED=0`, so it
   accepts the agent's self-signed control-API cert. Open ports **8443**, **2022**,
   and the game range **25565–25999** on the host firewall.

This is the lightest way to self-host — one machine, full platform — and scales
out later by simply adding more nodes.

---

## 🖥️ Setting up game nodes

A **node** is any Linux or Windows box that actually runs game servers. The panel
is the brain; nodes are the muscle. They never share a database — a node only ever
talks to the panel over a signed HTTPS control API, so a node can live anywhere
the panel can reach (same host, another VPS, another continent).

### How registration works (the short version)

The agent registers with a **one-time bootstrap token**. On first boot it calls
`POST /api/v1/agent/register` with the token, and the panel returns the node's
durable `nodeId` + a derived HMAC **signing key**. The agent persists those to
`<data_dir>/agent.state` and signs every subsequent request — so **the bootstrap
token is only needed once** and can be removed afterwards. (The signing key is
derived as `sha256(SECRETS_ENC_KEY + ":" + nodeId)`, never stored on the panel.)

### Step 1 — create the node in the panel

In the web panel go to **Admin → Nodes → Add node** and fill in:

| Field | Notes |
|------|-------|
| **Name** | Friendly label, e.g. `eu-frankfurt-01`. |
| **FQDN / IP** | A hostname or IP the **panel** can reach the node on. Players also connect here. |
| **Region** | Picked from a **dropdown** of seeded regions (`us-east`, `us-west`, `eu-central`, …) — no hand-typed IDs. |
| **OS** | `LINUX` or `WINDOWS`. |
| **CPU / RAM / Disk capacity** | What the node may hand out (used by the scheduler for placement). |
| **Daemon port** | Control API, default **8443**. |
| **SFTP port** | Per-server SFTP, default **2022**. |

Save it and **copy the bootstrap token** shown once. (Lost it? **Admin → Nodes →
⋯ → Regenerate token**.)

> Prefer the API? `POST /api/v1/admin/nodes` returns `{ node, bootstrapToken }`.

### Step 2 — install the agent on the node

> [!IMPORTANT]
> **`--panel-url` / `-PanelUrl` is the panel-_API_ (panel-api), not the website.**
> That's **port 4000** by default (e.g. `http://<panel-public-ip>:4000`), and do
> **not** append `/api` or `/api/v1` — the agent adds that itself. Pointing it at
> the web UI (port 3000 / your site) makes registration fail with an HTML `404`.
> The installers now probe `<panel-url>/health` and refuse a web-UI URL. A remote
> node must use the panel's **public** address; only a same-box (hybrid) node can
> use `http://127.0.0.1:4000`.

**Linux** (Ubuntu / Debian / AlmaLinux / Rocky, systemd, x86_64 / arm64):

```bash
curl -fsSL https://raw.githubusercontent.com/refxfrank/refxhosting/main/infra/scripts/install-node.sh -o install-node.sh
sudo bash install-node.sh \
  --panel-url http://<panel-public-ip>:4000 \
  --token <BOOTSTRAP_TOKEN>
# add --skip-docker if you only run native_process servers
```

**Windows Server 2022 / 2025** (PowerShell as Administrator):

```powershell
.\infra\scripts\install-node.ps1 -PanelUrl http://<panel-public-ip>:4000 -Token <BOOTSTRAP_TOKEN>
```

> [!NOTE]
> **Windows node specifics:**
> - **`data_dir` must be a drive-rooted Windows path** (e.g. `C:/ProgramData/ReFx/data`),
>   because it becomes a Docker bind-mount source. The installer sets this for you;
>   if you hand-edit the config, **don't** use a Unix path like `/var/lib/refx-agent`
>   — Docker rejects it with *"is not a valid Windows path"* and installs hang. The
>   agent now defaults to `%ProgramData%\ReFx\data` on Windows and refuses to start
>   with a clear message if `data_dir` isn't drive-rooted.
> - **Linux game images need Docker in Linux-container mode.** Most eggs (including
>   Minecraft's `eclipse-temurin`) are Linux images. On Windows that means Docker
>   Desktop with the **WSL2 backend** (Linux containers, *not* Windows-containers
>   mode), and the **`C:` drive shared** under *Settings → Resources → File Sharing*.
>   For Docker-free hosting, use the **`native_process`** runtime instead (run the
>   game directly on the host) — see [docs/06-node-agent.md](docs/06-node-agent.md).

The installer:
1. installs Docker Engine (unless `--skip-docker` / already present),
2. creates a `refx` system user + data dirs (`/var/lib/refx`),
3. downloads the matching `refx-agent` release binary (and verifies its checksum),
4. writes `/etc/refx/config.yaml` (schema = [`apps/node-agent/config.example.yaml`](apps/node-agent/config.example.yaml)),
5. opens firewall ports **8443** + **2022**,
6. installs and starts the `refx-agent` systemd service (Windows: a service).

### Step 3 — verify

```bash
systemctl status refx-agent          # should be active (running)
journalctl -u refx-agent -f          # watch it register + heartbeat
```

In **Admin → Nodes** the node flips to **ONLINE** within a few seconds and starts
streaming **CPU / RAM / disk / container** gauges. Use the **Ping** button to
measure panel→agent latency, and open a node to see its live heartbeat graphs.

> [!TIP]
> **Ping shows "offline" but the node is heartbeating?** Registration, heartbeats
> and stats are **agent → panel** (outbound from the node), but **Ping** is
> **panel → agent** on port **8443** (inbound to the node). If the box heartbeats
> yet pings offline, the panel can't reach the node's `:8443` — open inbound TCP
> **8443** from the panel's IP in the node's **cloud security group** (the host
> firewall rule is added for you), and confirm the node's **FQDN** in the panel is
> an address the panel can actually reach. Verify from the **panel** host:
> `curl -k https://<node-fqdn>:8443/healthz` should return `{"status":"ok"}`.

### Restart / update the agent

A restart is safe: the agent re-registers from its persisted `<data_dir>/agent.state`
(no token needed) and re-fetches its assigned servers, so **running game servers
keep running** and the agent re-attaches to them.

**systemd (installed via `install-node.sh`):**

```bash
sudo systemctl restart refx-agent                       # restart
sudo systemctl status refx-agent                        # verify active (running)
sudo systemctl kill -s SIGKILL refx-agent && \
  sudo systemctl start refx-agent                       # force-kill if wedged
```

**Manual / foreground run:**

```bash
pkill -f refx-agent                                     # stop (use -9 to force)
pgrep -af refx-agent                                    # confirm it's gone
nohup ./refx-agent --config config.yaml > agent.log 2>&1 &   # relaunch detached
```

**Update to a new agent build**, then restart with whichever method above applies:

```bash
git pull origin main
cd apps/node-agent && go build -o /usr/local/bin/refx-agent ./cmd/refx-agent
# cross-compile for Windows: GOOS=windows GOARCH=amd64 go build ./cmd/refx-agent
```

### Manual install (no release binary yet)

Releases aren't published? Build the binary and run it yourself:

```bash
cd apps/node-agent
go build -o refx-agent ./cmd/refx-agent          # cross-compile: GOOS=windows GOARCH=amd64 …
cp config.example.yaml config.yaml               # then edit panel.url + panel.bootstrap_token
./refx-agent --config config.yaml
```

Minimum viable `config.yaml`:

```yaml
data_dir: /var/lib/refx-agent            # Windows: use C:/ProgramData/ReFx/data (drive-rooted!)
panel:
  url: https://panel.example.com:4000     # the panel-API (port 4000), NOT the website
  bootstrap_token: "<BOOTSTRAP_TOKEN>"   # one-time; safe to delete after first boot
  skip_tls_verify: false                  # true only for a self-signed panel cert
api:
  bind_addr: 0.0.0.0:8443
sftp:
  bind_addr: 0.0.0.0:2022
runtime:
  default: docker                         # docker | native_process | windows_container
```

Every value can also be set via env (`REFX_PANEL_URL`, `REFX_PANEL_BOOTSTRAP_TOKEN`, …).

> On **Windows**, `data_dir` must be a drive-rooted path (e.g. `C:/ProgramData/ReFx/data`)
> since it becomes a Docker bind-mount source; a Unix path makes Docker fail with
> *"not a valid Windows path"*. The agent defaults to `%ProgramData%\ReFx\data` there.

### Ports & networking

| Port | Direction | Purpose |
|------|-----------|---------|
| **8443/tcp** | panel → node | Signed HTTPS control API + console WebSocket. |
| **2022/tcp** | clients → node | Per-server SFTP. |
| **25565–25999/tcp+udp** | players → node | Game server ports, **auto-allocated** per server. |

The node self-signs its control-API TLS cert on first boot. If the **panel** runs
behind a self-signed cert, set `panel.skip_tls_verify: true` on the agent; if the
**agent** uses a self-signed cert, run the panel with
`NODE_TLS_REJECT_UNAUTHORIZED=0` (already set in the Compose file for local/dev).

### Create a server on the node

- **Admins:** **Admin → Servers → Create** — pick an owner, the node, a game egg
  (and Minecraft version/loader), set limits, and provision directly (no SSH). The
  panel reserves a free port and the server's **IP:port** appears on its page.
- **Customers:** buy a plan in the storefront → the scheduler places it on the
  least-loaded node with capacity.

### Remove a node

Migrate or delete its servers first, then **Admin → Nodes → ⋯ → Delete**
(soft-delete; the panel refuses if servers are still attached). Stop the agent on
the box with `systemctl disable --now refx-agent`.

---

## 🔌 API reference

REST under `/api/v1`, code-first **GraphQL** at `/graphql`, interactive **Swagger** at `/docs`.

```bash
# Auth → get tokens
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@refx.example","password":"…"}'

# List your servers
curl http://localhost:4000/api/v1/servers -H "Authorization: Bearer $TOKEN"

# Power action
curl -X POST http://localhost:4000/api/v1/servers/$ID/power \
  -H "Authorization: Bearer $TOKEN" -d '{"action":"restart"}'
```

```graphql
query { me { id email servers { id name state template { name } } } }
```

Full spec: **[docs/03-api.md](docs/03-api.md)**.

---

## 🗂 Repository layout

```
refxhosting/
├── apps/
│   ├── panel-api/     # NestJS central panel API (REST + GraphQL)
│   ├── web/           # Next.js customer & admin panel
│   └── node-agent/    # Go cross-platform node daemon
├── packages/shared/   # Shared TS contract (enums, protocol, permissions)
├── database/          # prisma schema + migrations + seed (game templates)
├── infra/             # docker · k8s/helm · install scripts
├── docs/              # full architecture & operations documentation
└── .github/workflows/ # CI · release · security
```

---

## 🧪 Testing

```bash
cd apps/panel-api && npm test          # 150 unit tests
cd apps/panel-api && npm run test:e2e  # 47 HTTP integration tests
cd apps/node-agent && go test ./...    # agent unit tests
npx prisma validate --schema database/prisma/schema.prisma
```

---

## 📚 Documentation

Start at **[docs/00-index.md](docs/00-index.md)**. Highlights: [Architecture](docs/01-architecture.md) · [Database & ER](docs/02-database.md) · [API](docs/03-api.md) · [Node agent](docs/06-node-agent.md) · [Billing](docs/07-billing.md) · [Security](docs/08-security.md) · [Game templates](docs/10-game-templates.md) · [Migration](docs/11-migration.md) · [Production deploy](docs/19-production-deployment.md).

## 🤝 Contributing & security

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the dev setup and the per-component green-build bar, and **[SECURITY.md](SECURITY.md)** for private vulnerability disclosure. Assistants/new contributors: **[CLAUDE.md](CLAUDE.md)** is the fastest orientation.

## 📄 License

[AGPL-3.0](LICENSE) — if you run a modified version as a network service, you must offer users its source.

<div align="center">
<sub>Built as a complete, honest foundation — see the <a href="docs/16-status.md">implementation status</a> for exactly what's done vs. stubbed.</sub>
</div>
