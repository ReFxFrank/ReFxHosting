# Game egg backlog

Tracks requested game templates ("eggs"). Each egg lives in
`database/seed/templates/<slug>.json`. New eggs are **auto-loaded on every
deploy** (create-only) by the seed runner — no `SEED_DEMO` flag needed — and each
automatically gets a purchasable per-slot package (`gs-<slug>`) via
`seedPerSlotProducts()`. Existing templates are left untouched (admin tuning,
publish state and art are preserved).

## Done

| Game | Slug | Steam app | Notes |
|------|------|-----------|-------|
| 7 Days to Die | `seven-days-to-die` | 294420 | SteamCMD, Linux |
| Squad | `squad` | 403240 | SteamCMD, Linux |
| Garry's Mod | `garrys-mod` | 4020 | SteamCMD srcds, Linux |
| Team Fortress 2 | `team-fortress-2` | 232250 | SteamCMD srcds, Linux |
| Killing Floor 2 | `killing-floor-2` | 232130 | SteamCMD, Linux |
| V Rising | `v-rising` | 1604030 | Windows build via Proton |
| Enshrouded | `enshrouded` | 2278520 | Windows build via Proton |
| Conan Exiles | `conan-exiles` | 443030 | Windows build via Proton |
| Arma 3 | `arma3` | 233780 | SteamCMD, Linux |
| Arma Reforger | `arma-reforger` | 1890870 | SteamCMD, Linux |
| tModLoader (Terraria) | `tmodloader` | 1281930 | SteamCMD, Linux |
| Mordhau | `mordhau` | 629800 | SteamCMD, Linux |
| Astroneer | `astroneer` | 728470 | Windows build via Proton |
| Unturned | `unturned` | 1110390 | SteamCMD, Linux |
| American Truck Simulator | `american-truck-simulator` | 2239530 | SteamCMD dedicated, Linux |
| Soulmask | `soulmask` | 3017300 | SteamCMD, native Linux (UE5), CLI-driven |
| Insurgency: Sandstorm | `insurgency-sandstorm` | 581330 | SteamCMD, native Linux (32-bit UE4); map+scenario via URL args |
| Core Keeper | `core-keeper` | 1963720 | SteamCMD, native Linux (Unity); needs xvfb + log-tail wrapper |
| ICARUS | `icarus` | 2089300 | Windows build via Wine; players set in ServerSettings.ini |
| Sons of the Forest | `sons-of-the-forest` | 2465200 | Windows build via Wine; needs a 3rd (BlobSync) port |
| Abiotic Factor | `abiotic-factor` | 2857200 | Windows build via Wine; logs to file (startup tails it for detect) |

> Vanilla Terraria already shipped as `terraria` (`terraria.json`); `tmodloader`
> is the modded variant.
>
> **2026-06-30 batch.** The six above were added from canonical Pelican/Pterodactyl
> eggs (app ids + startup commands + `startupDetect` "done" strings adversarially
> verified against SteamDB and the official server docs). The three Windows titles
> (ICARUS, Sons of the Forest, Abiotic Factor) run via Wine on the `steamcmd:proton`
> image, like our V Rising / Conan eggs. **Test-provision one of each before relying
> on them** — Wine titles can need extra prefix deps, ICARUS has a known cold-start
> hang on some Wine images, and Insurgency's default `MAP_NAME`/`SCENARIO` may want
> tuning.

## To do

Each needs: a verified dedicated-server install path, the correct startup
command, and per-slot resource sizing. The "blocker" column is why it isn't
done yet.

| Game | Likely approach | Blocker / to verify |
|------|-----------------|---------------------|
| Barotrauma | SteamCMD native Linux, app `1026340` | App id + startup (`./DedicatedServer -batchmode`) verified, but **port/maxplayers/name are config-only** (`serversettings.xml` attributes) — needs an install-time render (XML attrs, like 7DtD's sed step) before shipping, or the allocated port won't match. |
| The Forest | SteamCMD Windows via Wine, app `556450` | Verified Windows-only (no native Linux server). **Port/slots are config-only** (`config.cfg`) — needs install-time render of the allocated port; also wants a Steam GSLT for the public browser. |
| SCUM | SteamCMD Windows via Wine, app `3792580` | Server app id is recent — verify it installs anonymously on first run; Windows-only + BattlEye + heavy RAM (12–16 GB). |
| Space Engineers / Empyrion | Windows via Wine | Wine + .NET/child-playfield processes are finicky; both spin up best on real Windows nodes. |
| Don't Starve Together | SteamCMD native Linux, app `343050` | Wants a **two-process** master+caves shard model (one server = two processes sharing a cluster dir) + a Klei cluster token for public listing — needs a multi-process launch wrapper. |
| Raft | `RaftDedicatedServer.exe` via Proton | Confirm the dedicated-server Steam app id + startup args before shipping (didn't want to ship a wrong app id). |
| Survive the Nights | SteamCMD dedicated | Verify server app id + startup; the dedicated server has been unstable across builds. |
| Chivalry 2 | — | No public anonymous SteamCMD dedicated server; it's Epic-hosted/cross-play — needs a confirmed self-host path. |
| theHunter: Call of the Wild | — | No dedicated server — multiplayer is peer/host-based, so there's nothing to host. |
| Farming Simulator 22 | Bundled dedicated server (Windows) | Dedicated server ships with a licensed copy of the game (not anonymous SteamCMD) and is browser-managed — needs a license + custom install flow. |
| Farming Simulator 25 | Bundled dedicated server (Windows) | Same as FS22 — licensed, manual dedicated server. |
| S&box | — | Facepunch's successor to GMod; no public server distribution yet (closed access). Revisit when servers ship. |
| MECHA CHAMELEON | — | Verify whether it ships a dedicated server at all + the app id. |

### How to add one

1. Copy an existing egg in `database/seed/templates/` (e.g. `rust.json` for a
   Linux SteamCMD game, `v-rising.json` for a Proton/Windows one).
2. Set `slug`, `name`, `category` (must be a seeded `GameCategory` slug:
   survival / modded / sandbox / simulation / roleplay / shooter), `steamAppId`,
   `startupCommand`, `installScript`, `recCpuCores/recMemoryMb/recDiskMb`, and
   `variables`.
3. Redeploy (run the migrate/seed step, e.g. `infra/scripts/update-panel.sh`).
   The egg auto-loads (create-only) and a `gs-<slug>` per-slot product +
   per-interval pricing is created automatically; tune it in Admin → Products.
   No `SEED_DEMO` change is required.
4. Optional: drop art at `apps/web/public/games/<slug>.svg` (falls back to a
   default otherwise).

> To retire a seeded egg for good, delete it in the admin panel **and** remove
> its `database/seed/templates/<slug>.json` file — otherwise the auto-loader
> re-creates it on the next deploy.
