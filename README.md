<div align="center">

<img src="apps/web/public/brand/refx-wordmark.png" alt="ReFx Hosting" width="380" />

# ReFx Hosting

### The open game-server hosting platform with **GPortal-style game switching**

Buy a server slot **once** — swap between Minecraft, Rust, ARK, Valheim, Palworld, CS2, FiveM and more **without redeploying**.
A production-grade alternative to **Pterodactyl**, **AMP**, and **GPortal**, with an original cross-platform node agent, integrated billing, and a built-in helpdesk.

[![CI](https://github.com/refxfrank/refxhosting/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![Security](https://github.com/refxfrank/refxhosting/actions/workflows/security.yml/badge.svg)](./.github/workflows/security.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](#tech-stack)
[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](#-node-agent--apps-node-agent)
[![Next.js](https://img.shields.io/badge/Next.js%2014-000?logo=next.js&logoColor=white)](#-web-panel--apps-web)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](#-panel-api--apps-panel-api)

[Quick start](#-quick-start) · [Cheat-sheet](#-operator-cheat-sheet-this-box) · [Node setup](#️-setting-up-game-nodes) · [Architecture](#-architecture) · [Game switching](#-the-signature-feature-game-switching) · [API](#-api-reference) · [Docs](docs/00-index.md) · [Status](docs/16-status.md)

</div>

---

## ✨ Why ReFx Hosting

Most panels lock a server to one game. **ReFx treats the server as a durable, billable identity** — its `shortId`, SFTP login, backups, and subscription stay put while the game *software* underneath is swapped on demand. That's the model GPortal popularised, built here on an **original node agent** that runs games in **Docker _or_ as native processes** (the thing most panels can't do well) — identically on **Linux and Windows**.

| | |
|---|---|
| 🔁 **Game switching** | Stop → pick a new game → reinstall → play. Same server, same billing. |
| 🧩 **Docker _and_ native hosting** | One `Runtime` interface; games that hate containers run as resource-limited native processes (cgroups v2 / Windows Job Objects). |
| 🖥️ **True multi-OS** | A single Go binary runs on Ubuntu, Debian, AlmaLinux, Rocky **and** Windows Server 2022/2025. |
| 💳 **Billing built in** | Products, subscriptions, invoices, VAT/GST/US tax, Stripe + PayPal (both with **verified webhooks** + capture), auto-renewal & dunning. **Edit products _and_ per-interval pricing** from the panel; **owner-only gateway/key editor** (encrypted at rest). **Coupons** (% or fixed, min-order, usage caps, expiry) and **gift cards** (stored-value codes) redeemable at checkout. |
| 🛟 **Helpdesk built in** | A full **admin ticket queue** — reply, internal notes, set status/priority, categorise, assign — plus manageable **categories (SLA targets)** and **canned responses**, and a knowledge base. |
| 🔐 **Enterprise auth + custom RBAC** | Argon2id, TOTP + WebAuthn, scoped API keys, audit logs. **Build your own roles**: an owner-only Roles page with a granular admin-permission catalog; the whole admin surface is permission-gated end-to-end (customers never see it). Per-server sub-user permissions too. |
| 🧱 **Eggs, evolved** | JSON-driven game templates — admins add new games with **zero code changes**. |
| ⛏️ **One Minecraft, every loader** | Buy **Minecraft once**, then pick **Vanilla / Paper / Fabric / Forge / NeoForge** and the **exact version** any time from a dedicated **Minecraft** tab — the server keeps its identity. **Automatic JVM selection** per version means no `UnsupportedClassVersionError` boot crashes. |
| 🧩 **Mods _and_ modpacks** | Built-in **Modrinth** browser: **one-click install** of individual mods/plugins (loader/version-aware), **and a full modpack installer** that downloads a `.mrpack`, **auto-switches the server to the pack's Minecraft version + loader**, then provisions every mod and config. |
| 🔒 **Rootless game containers** | Game servers run as a non-root user (`uid 1000`), so you don't get the "running as root" warning and a compromised server can't run as root on the node. |
| 🔌 **Auto networking** | Every new server reserves a free port and wires it into the game's startup automatically; players connect at the **IP:port** shown right on the server page (one-click copy). |
| 🛠️ **Admin power tools** | Create servers straight from an egg (no SSH), manage & delete nodes, **start/stop/restart individual servers from the node view**, pick a node's **region from a dropdown**, and watch **live node CPU / RAM / disk / ping graphs** from heartbeats. |
| 🗂️ **Real file manager + live SFTP** | Browse, edit, upload, compress/extract files in the browser, or connect over **SFTP** — credentials you rotate in the panel propagate to the node **immediately** (no restart). |
| 🎨 **ReFx Glassy UI** | Dark, premium control-panel design (`#0072ff`) with a live `xterm.js` console that **survives page switches and refreshes**, real-time resource gauges, per-game storefront artwork, and **sessions that stay signed in across panel rebuilds**. |
| 📦 **Migrate in** | Importers for **Pterodactyl** (live), AMP & TCAdmin (scaffolded). |

> [!NOTE]
> **Project status — honest.** This repo is a **complete architecture + a verified, building foundation**, not a finished commercial SaaS. Every component builds/typechecks/tests/validates (**144 unit + 47 e2e tests green**, agent cross-compiles to 3 targets, schema validates). External-integration edges are marked `// TODO(impl)`. The exact implemented-vs-stubbed matrix lives in **[docs/16-status.md](docs/16-status.md)**, and the frontend↔backend route map in **[docs/17-integration-map.md](docs/17-integration-map.md)**.

> [!TIP]
> **Recently shipped:** **Modrinth modpack installer** (auto loader/version switch) · **custom RBAC** roles + permission-gated admin · **admin Support ticket queue** + categories & canned responses · **editable products & per-interval pricing** · **owner-only payment-gateway/key editor** + Stripe webhook wiring · separate **customer vs admin** areas · **reverse-proxy hardening** (loopback port binding + trust-proxy) · contact/billing **address fields** + idle-session timeout · self-healing migrations · unified **one-Minecraft** product with post-purchase loader/version tab · built-in **Modrinth** mod & plugin browser · **rootless** game containers · in-browser **file manager** + live **SFTP** credential rotation · **per-server power controls** in the admin node view · console that **persists across navigations & refreshes** · sessions that **stay signed in across panel rebuilds**.

---

## 🆚 How it compares

| | **ReFx** | Pterodactyl | AMP | GPortal |
|---|:---:|:---:|:---:|:---:|
| Open source | ✅ AGPL-3.0 | ✅ MIT | ❌ commercial | ❌ proprietary |
| **Game switching** (keep server, swap game) | ✅ | ❌ | ⚠️ reinstall | ✅ |
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
| 🏭 Satisfactory | 🌳 Terraria | 🧠 Project Zomboid | _+ add your own_ |

Each is a JSON template in [`database/seed/templates/`](database/seed/templates) — no code required to add a game. See **[docs/10-game-templates.md](docs/10-game-templates.md)**.

> **Minecraft, unified:** there's now a **single Minecraft product**. After buying, open the server's **Minecraft** tab to choose the loader — **Vanilla, Paper, Fabric, Forge or NeoForge** — and the **exact version** (resolved live from each project's API; Mojang's manifest for Vanilla), switching between them whenever you like without losing the server. The panel **auto-picks the right `eclipse-temurin` JVM** for the chosen version (Java 11 → 25), so newer releases boot without manual image fiddling, and loader builds can be pinned or left as `latest`/`recommended` (auto-resolved at install). On modded/plugin loaders, the **Mods** tab adds Modrinth search + one-click install.

### 💰 Storefront pricing (seeded per-slot defaults)

The GPortal-style order page sells **per-slot products** — one is **auto-seeded for every game egg** (`seedPerSlotProducts()` in `database/seed/seed.ts`). The seeded numbers below are **starting defaults**; edit any of them per game in **Admin → Products** (the seeder is create-only and never overwrites your edits, nor reactivates a product you deactivate).

**Per-slot resources** (derived from each template's *recommended* specs, treated as ~**8 slots'** worth, with floors):

| Resource | Formula | Floor |
|----------|---------|-------|
| vCPU / slot | `recCpuCores ÷ 8` (2 dp) | `0.10` |
| RAM / slot | `recMemoryMb ÷ 8` | `256 MB` |
| Disk / slot | `recDiskMb ÷ 8` | `512 MB` |

A server's provisioned resources are **per-slot × slot count**. Slot slider defaults: **min 2, max 64, step 2**.

**Price** — the base **monthly per-slot** rate is `max($0.50, RAM_GB_per_slot × $1.50)`. Each billing term is priced from that with a discount, and the order total is **per-slot price × slots**:

| Term | Multiplier | Discount | Per-slot amount |
|------|-----------|----------|-----------------|
| Weekly | × 7⁄30 | — (proportional) | `monthly × 7 ÷ 30` (floor 25¢) |
| Biweekly | × 14⁄30 | — (proportional) | `monthly × 14 ÷ 30` (floor 50¢) |
| Monthly | × 1 | — | `monthly` |
| Quarterly | × 3 | **−10%** | `monthly × 3 × 0.90` |
| Semi-annual | × 6 | **−15%** | `monthly × 6 × 0.85` |
| Annual | × 12 | **−20%** | `monthly × 12 × 0.80` |

Terms shorter than a month (**weekly/biweekly**) are billed **proportionally with no discount**; renewals step by exact days (7/14), while monthly+ terms step by calendar month.

_Example — a game with **8 GB** recommended RAM → **1 GB/slot** → **$1.50/slot/month**. A 10-slot monthly server = **$15.00/mo**; the same annually = `1.50 × 12 × 0.80 × 10` = **$144.00/yr** (≈ $12/mo). All amounts are stored as integer minor units (cents)._

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
NestJS central panel. **Compiles clean & boots; 144 unit + 47 e2e tests green.**

| Area | Where | Notable functions / endpoints |
|------|-------|-------------------------------|
| Auth & MFA | `src/auth` | `register` / `login` (Argon2id), JWT access+refresh with **rotation + reuse detection**, `totpEnroll`/`totpVerify`, WebAuthn ceremonies, scoped + IP-allowlisted API keys |
| AuthZ | `src/auth/guards` | `RolesGuard` (global roles), `PermissionGuard` (per-server `SubUser` perms, owner/admin override, wildcard `files.*`) |
| Servers | `src/servers` | `POST /servers` (queues provisioning), power `start/stop/restart/kill`, `reinstall`, **`switchGame()`**, **`setMinecraftConfig()`** (loader + version), **Modrinth mod search/install**, **modpack installer** (`ModpackProcessor` — `.mrpack` → loader/version switch + mods/config), `resize()` (capacity-checked), variables/allocations/sub-users/schedules |
| Agent link | `src/agent` | `NodeAgentClient` (HMAC-signed calls), `ConsoleGateway` (browser ↔ agent WebSocket relay) |
| Billing | `src/billing` | `calculateTax()` (VAT/GST/US), invoice numbering, **editable products + per-interval prices**, `StripeGateway`/`PayPalGateway` with **DB-backed encrypted keys** (`SettingsService`), **Stripe webhook** (idempotent invoice/checkout/payment events), renewal + dunning workers |
| Support | `src/support` | **admin ticket queue** (reply/notes/status/priority/assign), **categories (SLA) + canned responses CRUD**, SLA breach computation, KB |
| AuthZ (custom RBAC) | `src/admin`, `src/common/permissions.ts` | `Role` model + granular admin-permission catalog, `AdminPermissionGuard` + `@RequirePerm`, owner-only Roles management |
| Platform | `src/platform` | audit query, notifications, global alerts, encrypted settings store, `/health`, Prometheus `/metrics` |

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
- **Switch-game flow** — choose from the plan-allowed catalog with an explicit keep-vs-wipe data decision.
- **Resource upgrade** — CPU/RAM/disk sliders with live price preview.
- **Separate customer & admin areas** — distinct layouts/nav; the entire `/admin` surface is **permission-gated** (server-enforced), so customers never see staff tooling.
- **Admin power tools** — create servers from an egg; manage nodes (region **dropdown** on create) with **per-server power controls**; **Products** with an inline **price editor**; an **owner-only Payments** page with a gateway/key editor; **Orders/Invoices** (void/delete); a **Support** ticket queue + categories/canned responses; a **Roles & permissions** builder; **Customers/Users** with full account view + delete.
- Sessions **stay signed in across panel rebuilds** (transient-tolerant token refresh + optional "keep me signed in"); an **idle-session timeout** prompts before logging out.
- Plus dashboard, backups, databases, schedules, billing, account/security, and a GPortal-style **storefront** with per-game artwork and node-derived server locations.

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
cd apps/panel-api && npm test          # 144 unit tests
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
