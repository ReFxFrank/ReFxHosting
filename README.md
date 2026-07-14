<div align="center">

<img src="apps/web/public/brand/refx-wordmark.png" alt="ReFx Hosting" width="380" />

# ReFx Hosting

### The open, multi‑OS **game & voice** server‑hosting platform — with GPortal‑style game switching

**Game servers** sell on configurable **hardware tiers** (Low · Mid · High). **Voice servers** (TeamSpeak 3) sell **per slot**. Customers buy a server **once** and swap between Minecraft, Rust, ARK, Valheim, Palworld, CS2, FiveM and more **without redeploying** — a production‑grade, self‑hostable alternative to **Pterodactyl**, **AMP**, and **GPortal** with an original cross‑platform node agent, recurring **Stripe + PayPal** billing, a built‑in helpdesk, **native companion apps** — an **iOS app** with **APNs push** and **[ReFx Remote](https://github.com/ReFxFrank/ReFx-Remote)**, a **Windows desktop app** — and a **public status page** with a live world map and operator incidents.

<br/>

[![CI](https://github.com/refxfrank/refxhosting/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
[![Security](https://github.com/refxfrank/refxhosting/actions/workflows/security.yml/badge.svg)](./.github/workflows/security.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-0072FF.svg?style=flat-square)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-573_unit_·_49_e2e_green-0072FF?style=flat-square)](#-testing)

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](#-tech-stack)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](#-node-agent--apps-node-agent)
[![Next.js](https://img.shields.io/badge/Next.js%2014-000?style=flat-square&logo=next.js&logoColor=white)](#-web--apps-web)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)](#-panel-api--apps-panel-api)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white)](#-tech-stack)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](#-tech-stack)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](#-quick-start)

**<samp>Primary&nbsp;#0072FF</samp>** · Dark glassy control‑panel UI · One Go binary for Linux **and** Windows nodes

[Quick start](#-quick-start) · [Cheat-sheet](#-operator-cheat-sheet-this-box) · [Node setup](#️-setting-up-game-nodes) · [Architecture](#-architecture) · [Game switching](#-the-signature-feature-game-switching) · [Pricing model](#-how-pricing-works) · [Companion apps & status page](#-companion-apps--public-status-page) · [API](#-api-reference) · [Docs](docs/00-index.md) · [Status](docs/16-status.md)

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
| 🧰 **Steam Workshop** | A per-server **Workshop tab** for Steam games (Garry's Mod, Arma 3, Project Zomboid, DayZ, CS2): add **items or collections** by ID/URL, enable/reorder/remove, then **Apply** to install. A **central SteamCMD login + Web API key** (encrypted, owner-managed) powers downloads that require an account. |
| 🔒 **Rootless game containers** | Game servers run as a non-root user (`uid 1000`), so you don't get the "running as root" warning and a compromised server can't run as root on the node. |
| 🔌 **Auto networking** | Every new server reserves a free port and wires it into the game's startup automatically; players connect at the **IP:port** shown right on the server page (one-click copy). |
| 🛠️ **Admin power tools** | Create servers straight from an egg (no SSH), manage & delete nodes, **start/stop/restart individual servers from the node view**, pick a node's **region from a dropdown**, and watch **live node CPU / RAM / disk / ping graphs** from heartbeats. |
| 🗂️ **Real file manager + live SFTP** | Browse, edit, upload, compress/extract files in the browser, or connect over **SFTP** — credentials you rotate in the panel propagate to the node **immediately** (no restart). |
| 🎨 **ReFx Glassy UI** | Dark, premium control-panel design (`#0072ff`) with a live `xterm.js` console that **survives page switches and refreshes**, real-time resource gauges, per-game storefront artwork, and **sessions that stay signed in across panel rebuilds**. |
| 📱 **Companion apps — iOS + Windows** | A **native iOS companion app** backed by **token-based APNs** (ES256 `.p8`, no SDK dependency): customers register a device (`/account/push-tokens`) and get push for **server state** (online/offline/crashed, throttled), **invoices** (created/due/failed), **support replies**, and **status incidents**; stale tokens auto-prune on `410/BadDeviceToken`, and push disables cleanly when APNs isn't configured. **[ReFx Remote](https://github.com/ReFxFrank/ReFx-Remote)** is the same idea for the desktop — a **native Windows app** (ready-to-run `.exe` from [GitHub Releases](https://github.com/ReFxFrank/ReFx-Remote/releases/latest)) for managing your servers without opening the panel. The storefront carries download links for both. |
| 🌍 **Public status page** | A polished **`/status`** page with a real **world map** (Natural Earth land paths, regions plotted at their datacenter coords) that rolls live node health into **per-region + per-component** status — **Control Panel API, Web Dashboard, Game Server Nodes, iOS App**. Operators post **incidents** with a timeline (admin CRUD, `content.manage`); active + 30-day history render publicly, and an incident update can **broadcast a push** to customers. |
| 🔀 **Server transfers between nodes** | Admin-only, Pterodactyl-style **move a server to another node** (`POST /admin/servers/:id/transfer`). A `TRANSFER` job snapshots on the source (backup→S3), provisions + restores on the destination with fresh ports, then repoints atomically — the **server keeps its identity** and the **source is deleted only after the destination verifies**, so any failure rolls back and the server survives. |
| 🔑 **Admin password management** | From **Admin → Users** an admin can **email a reset link** or **set a temporary password** (auto-generated or chosen). A temp password flags `mustChangePassword`, **revokes all the user's sessions**, and **forces a change at next sign-in** — enforced **server-side** (you can't skip it by hitting the API directly, or even via the WebSocket console). Admins can only act on **strictly lower-privileged** accounts. |
| 🛡️ **Hardened by default** | Security controls enforced at the framework layer, not just the UI: **server-side `mustChangePassword`** (global interceptor blocks every route bar change-password/me/logout/refresh), an **API-key WRITE-scope ceiling** (a READ key can never drive a mutating request, even on JWT-only controllers), **single-use + time-boxed node bootstrap tokens** (atomic consume, 30-min TTL), and **GraphQL introspection/playground off in production**. |
| ⚖️ **Launch-ready legal** | First-class **Terms, Privacy, Acceptable-Use and Refund** pages, a footer that links them, an **honest cookie-consent banner** (necessary + telemetry only — no ad/tracking cookies), and a central `lib/legal.ts` with a sub-processor list and `{{placeholder}}` fields that stay visible until the operator fills them in. |
| 📦 **Migrate in** | Importers for **Pterodactyl** (live); AMP & TCAdmin on the roadmap. |

> [!NOTE]
> **Project status.** ReFx Hosting is the **production platform that runs [refx.gg](https://refx.gg)** — not a demo or a scaffold. Every component builds/typechecks/tests/validates (**573 unit + 49 e2e tests green**, agent cross-compiles to 3 targets, schema validates). A few optional external-integration edges (e.g. additional payment SDKs, extra panel importers) are marked `// TODO(impl)`. The exact implemented-vs-stubbed matrix lives in **[docs/16-status.md](docs/16-status.md)**, and the frontend↔backend route map in **[docs/17-integration-map.md](docs/17-integration-map.md)**.

> [!TIP]
> **Recently shipped:** **ReFx Remote — a native Windows desktop companion app** (ready-to-run `.exe`, downloads on the storefront) · **native iOS companion app + token-based APNs push** (server state · invoices · support replies · status incidents) · **public status page** with a live world map, per-region/per-component health and operator **incidents** (+ customer push broadcast) · **admin-only server transfers between nodes** (snapshot → provision → restore → repoint, with rollback) · **admin password management** (email reset or temp password + forced change) · a **security-hardening pass** (server-side `mustChangePassword`, API-key write-scope ceiling, single-use/time-boxed bootstrap tokens, GraphQL introspection off in prod) verified against a self-audit · **legal/policy pages + cookie-consent banner** · **billing settlement/dunning/renewal test suite** · **Steam Workshop management** (per‑server Workshop tab + central SteamCMD login & Web API key) · **hardware‑tier game servers** (Low/Mid/High cards + admin tier editor) · **slot‑based voice hosting — TeamSpeak 3** · **recurring PayPal via the Subscriptions API** · **public "Meet the team" page** · **coupons + gift cards + account/store credit** · **custom RBAC** + permission‑gated admin · **admin Support ticket queue** · **owner‑only payment‑gateway/key editor** · unified **one‑Minecraft** product with loader/version tab · built‑in **Modrinth** mods + **modpack installer** · **rootless** game containers · in‑browser **file manager** + live **SFTP** rotation · console that **persists across navigations & refreshes**.

---

## 📸 See it in action

<div align="center">

<img src="docs/screenshots/storefront-home.png" alt="ReFx Hosting storefront — hero and game catalogue" width="820" />

<sub>The live storefront at <a href="https://refx.gg">refx.gg</a>.</sub>

</div>

| Order a server | Public status page |
|:--:|:--:|
| <img src="docs/screenshots/store-games.png" alt="Order page with hardware-tier cards" width="410" /> | <img src="docs/screenshots/status-page.png" alt="Public status page with a live world map" width="410" /> |

<sub>Screenshots live in <a href="docs/screenshots/">docs/screenshots/</a> — see that folder's guide to add or refresh them (and the sanitisation checklist, since this repo is public).</sub>

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
| **Native mobile app** (iOS + push) | ✅ | ❌ | ❌ | ⚠️ |
| **Public status page** (map + incidents) | ✅ | ❌ | ❌ | ⚠️ |
| **Live server transfer** between nodes | ✅ | ⚠️ manual | ⚠️ | ✅ |
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
    subgraph Client["🌐 Browser / mobile / desktop / API clients"]
        UI["Web Panel — Next.js 14"]
        IOS["📱 iOS app"]
        WIN["🖥️ ReFx Remote (Windows)"]
        API_C["REST / GraphQL clients"]
    end

    subgraph Central["🧠 Central Panel"]
        API["panel-api — NestJS<br/>REST /api/v1 · GraphQL · Swagger"]
        Q["BullMQ workers<br/>provision · backup · renew · suspend · transfer"]
        DB[("PostgreSQL")]
        R[("Redis")]
        S3[("S3 / MinIO<br/>backups + attachments")]
        OS[("OpenSearch")]
    end

    APNS[["🍎 Apple APNs"]]

    subgraph Nodes["🖥️ Game Nodes (Linux / Windows)"]
        A1["node-agent (Go)"]
        A2["node-agent (Go)"]
        A1 --- D1["Docker / native processes"]
        A2 --- D2["Docker / native processes"]
    end

    UI --> API
    IOS --> API
    WIN --> API
    API_C --> API
    API <--> DB
    API <--> R
    API <--> OS
    Q <--> R
    API -- "push (HTTP/2, ES256)" --> APNS
    APNS -. "alerts" .-> IOS
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

## 📱 Companion apps & public status page

### 📱 iOS companion app + push

A **native iOS app** lets customers power/monitor their servers, watch billing, and answer support tickets on the go. It's backed by **first-party, token-based APNs** in `panel-api` (HTTP/2 + ES256 `.p8`, **no third-party SDK**):

- A device registers via `POST /api/v1/account/push-tokens` (removed with `DELETE …/:token`); tokens live in the `PushToken` model.
- `PushService.sendToUser()` mirrors in-app events as pushes — `server.state` (online/offline/crashed, **30-min per-server/state throttle**), `billing.invoice` (created/due/failed), `support.reply` (staff → customer) and `status.incident` — each carrying a `type` + id at the payload top level for deep-linking.
- A `410 / BadDeviceToken` response **auto-prunes** the stale token. APNs is configured from `APNS_KEY_P8_BASE64` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` (+ `APNS_PRODUCTION`); when unset, push **disables cleanly** and the rest of the panel is unaffected. The app's `apple-app-site-association` is served from `/.well-known`, and the storefront carries an **App Store** listing (`NEXT_PUBLIC_APP_STORE_URL`).

> The iOS app's own Swift source lives outside this monorepo; everything the panel needs to **serve** it — push, token endpoints, deep-link payloads, the universal-links file and the store listing — ships here.

### 🖥️ ReFx Remote — Windows desktop companion

**[ReFx Remote](https://github.com/ReFxFrank/ReFx-Remote)** is the iOS app's counterpart for the desktop: a **native Windows application** for customers who'd rather manage their servers from an app than a browser tab. It signs in with the same refx.gg account and talks to the same public panel API — no special server-side integration required.

- **Ready-to-run `.exe`** — download the latest build from **[GitHub Releases](https://github.com/ReFxFrank/ReFx-Remote/releases/latest)**; no installer ceremony.
- The storefront promotes it alongside the iOS app (homepage **companion apps** band + footer **"Get the apps"** badges). The download badge points at the latest release; set `NEXT_PUBLIC_REMOTE_DOWNLOAD_URL` to pin a direct asset URL instead.
- Source lives in its own repository, like the iOS app: [`ReFxFrank/ReFx-Remote`](https://github.com/ReFxFrank/ReFx-Remote).

### 🌍 Public status page (`/status`)

A polished, **public** status page (no login) that turns real telemetry into an at-a-glance picture:

- `GET /api/v1/status` (cached) rolls each node's **state + heartbeat freshness** into **per-region** and **per-component** status — **Control Panel API, Web Dashboard** (panel-api pings the web container's health), **Game Server Nodes**, and **iOS App**.
- The web page (`apps/web/app/(public)/status`) draws a real **world map** — land outlines from **Natural Earth 110m** (public domain) in [`apps/web/lib/world-land.ts`](apps/web/lib/world-land.ts) — and plots each region as a status-coloured dot at its datacenter coordinates with **up / total** node counts.
- Operators post **incidents** (`StatusIncident` + `StatusIncidentUpdate` timeline) from **Admin → Status** (`content.manage`): create/update/resolve, choose impact (maintenance / degraded / outage) and the affected components. Unresolved incidents drive those components' status; **active + 30-day history** render on `/status`, and an incident update can **broadcast a push** to customers. The **iOS App** component has no auto-signal, so its status is **admin-declared** via incidents.

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
NestJS central panel. **Compiles clean & boots; 573 unit + 49 e2e tests green.**

| Area | Where | Notable functions / endpoints |
|------|-------|-------------------------------|
| Auth & MFA | `src/auth` | `register` / `login` (Argon2id), JWT access+refresh with **rotation + reuse detection**, `totpEnroll`/`totpVerify`, WebAuthn ceremonies, scoped + IP-allowlisted API keys, **admin password tools** (`adminSendPasswordReset` / `adminSetPassword` → temp password + `mustChangePassword` + session revoke) |
| AuthZ | `src/auth/guards` | `RolesGuard` (global roles), `PermissionGuard` (per-server `SubUser` perms, owner/admin override, wildcard `files.*`) |
| Hardening | `src/common/interceptors` | global `PasswordChangeInterceptor` (server-side `mustChangePassword` ceiling + `@AllowWhenPasswordExpired`), `ApiKeyWriteScopeInterceptor` (READ keys can't mutate); `ConsoleGateway` re-checks account state so the WS surface isn't a bypass |
| Servers | `src/servers` | `POST /servers` (queues provisioning), power `start/stop/restart/kill`, `reinstall`, **`switchGame()`**, **`setMinecraftConfig()`** (loader + version), **Modrinth mod search/install**, **modpack installer** (`ModpackProcessor` — `.mrpack` → loader/version switch + mods/config), `resize()` (capacity-checked), **`TransfersService`** (admin node-to-node move: snapshot → provision → restore → repoint, rollback-safe), variables/allocations/sub-users/schedules |
| Nodes | `src/nodes` | create/heartbeat/capacity, per-node allocation port range, **single-use + time-boxed bootstrap tokens** (`registerAgentByToken` — atomic consume, 30-min TTL, `regenerateBootstrap`) |
| Agent link | `src/agent` | `NodeAgentClient` (HMAC-signed calls), `ConsoleGateway` (browser ↔ agent WebSocket relay), optional cert **pinning** (`AGENT_TLS_PINNING`) |
| Billing | `src/billing` | **two billing models** (`HARDWARE_TIER` tiers + `PER_SLOT`), `HardwareTier` CRUD, server‑side price validation, `calculateTax()` (VAT/GST/US), invoice numbering, `StripeGateway`/`PayPalGateway` with **DB‑backed encrypted keys**, **Stripe + PayPal verified webhooks**, **recurring PayPal Subscriptions** (`ensurePayPalPlan`/`startPayPalSubscription`/`settlePayPalRecurringPayment`), **settlement funnel** (`markInvoicePaid` idempotent), renewal + dunning workers (covered by `billing.service.settlement.spec.ts`) |
| Orders | `src/orders` | checkout orchestration: validate product/tier/slots, create subscription + first invoice, settle via gateway (or start a PayPal subscription), reserve‑then‑provision on payment |
| Push | `src/push` | token-based **APNs** over HTTP/2 (ES256 `.p8`, no SDK), `PushService.sendToUser`, `PushToken` model, `/account/push-tokens`; auto-prune on `410/BadDeviceToken` |
| Status | `src/status`, `src/platform` (incidents) | public `GET /status` (region/component rollup, cached), `StatusIncident` + timeline, admin incident CRUD (`/admin/status/incidents`), customer push broadcast |
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
- **Admin power tools** — create servers from an egg; manage nodes (region **dropdown** on create) with **per-server power controls**; **transfer a server to another node** with live progress; **Products** with an inline **price editor**; an **owner-only Payments** page with a gateway/key editor; **Orders/Invoices** (void/delete); a **Support** ticket queue + categories/canned responses; a **Status/Incidents** console; a **Roles & permissions** builder; **Customers/Users** with full account view, delete, and **password management** (email a reset or set a temp password).
- **Public status page** (`/status`) — a world map of regions with per-component/per-region health and an incident feed (active + history), all driven by the live `/api/v1/status` feed.
- **Legal & consent** — Terms / Privacy / Acceptable-Use / Refund pages, a footer that links them, and an honest **cookie-consent banner** (necessary + telemetry only).
- **Companion-app listings** — a storefront promo band + footer badges for the **iOS app** (App Store, with the universal-links `apple-app-site-association`) and **ReFx Remote for Windows** (direct download from GitHub Releases).
- Sessions **stay signed in across panel rebuilds** (transient-tolerant token refresh + optional "keep me signed in"); an **idle-session timeout** prompts before logging out; an admin-set temporary password triggers a **forced password change** (enforced server-side).
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
# Optional: iOS push (APNs) — leave unset to disable push cleanly.
#   APNS_KEY_P8_BASE64=<base64 of the .p8>   APNS_KEY_ID=...   APNS_TEAM_ID=...
#   APNS_BUNDLE_ID=com.example.refx           APNS_PRODUCTION=true
#   NEXT_PUBLIC_APP_STORE_URL=https://apps.apple.com/app/...  (storefront listing)
# Keep the APNs .p8 in env/secrets only — never commit it to the repo.
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

# Public status feed (no auth) — region/component health + incidents
curl http://localhost:4000/api/v1/status

# Register an iOS device for push
curl -X POST http://localhost:4000/api/v1/account/push-tokens \
  -H "Authorization: Bearer $TOKEN" -d '{"token":"<apns-device-token>","platform":"ios"}'
```

```graphql
query { me { id email servers { id name state template { name } } } }
```

Other notable surfaces: `POST /api/v1/admin/servers/:id/transfer` (move a server between nodes), `POST /api/v1/admin/users/:id/set-password` (admin temp password), and `…/admin/status/incidents` (incident CRUD). Full spec: **[docs/03-api.md](docs/03-api.md)**.

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
cd apps/panel-api && npm test          # 573 unit tests (63 suites)
cd apps/panel-api && npm run test:e2e  # 49 HTTP integration tests
cd apps/node-agent && go test ./...    # agent unit tests
npx prisma validate --schema database/prisma/schema.prisma
```

Highlights of the unit suite: the **billing settlement/dunning/renewal** engine
(`billing.service.settlement.spec.ts`), the **security-hardening** controls
(`auth.service.hardening.spec.ts`, `password-change.interceptor.spec.ts`,
`api-key-write-scope.interceptor.spec.ts`, `nodes.service.bootstrap-token.spec.ts`),
**server transfers** (`transfers.service.spec.ts`), **APNs push**
(`push.service.spec.ts` + the agent/support push hooks), the **status** rollup
(`status.service.spec.ts`), and **game switching** (`servers.service.switch-game.spec.ts`).

---

## 📚 Documentation

Start at **[docs/00-index.md](docs/00-index.md)**. Highlights: [Architecture](docs/01-architecture.md) · [Database & ER](docs/02-database.md) · [API](docs/03-api.md) · [Node agent](docs/06-node-agent.md) · [Billing](docs/07-billing.md) · [Security](docs/08-security.md) · [Game templates](docs/10-game-templates.md) · [Migration](docs/11-migration.md) · [Production deploy](docs/19-production-deployment.md).

## 🤝 Contributing & security

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the dev setup and the per-component green-build bar, and **[SECURITY.md](SECURITY.md)** for private vulnerability disclosure. Assistants/new contributors: **[CLAUDE.md](CLAUDE.md)** is the fastest orientation.

## 📄 License

[AGPL-3.0](LICENSE) — if you run a modified version as a network service, you must offer users its source.

<div align="center">
<sub>The production platform behind <a href="https://refx.gg">refx.gg</a> — see the <a href="docs/16-status.md">implementation status</a> for exactly what's done vs. stubbed.</sub>
</div>
