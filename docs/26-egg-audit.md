# 26 — Game egg / install audit (pre-launch)

A deep audit of all 31 game eggs (`database/seed/templates/*.json`) and their
install/boot processes, done before taking paying customers. Steam app IDs and
download URLs were verified against live sources. **Severity:** BLOCKER = won't
install or boot for a customer; WARN = boots but a setting is ignored / fragile.

> **How fixes reach the panel.** Template auto-load is **create-only** — editing
> an egg JSON updates only games **not yet seeded**. For games already in your DB,
> apply the fix via **Admin → (egg editor)**, or re-import the template. Fresh
> installs pick up the JSON directly.
>
> **None of this is runnable-verified here** (no game node). Treat the fixes as
> code-reviewed; **smoke-test each game on a real node before selling it.**

## 🟢 Update — post-audit fixes (2026-06-27, several node-verified)

Live node testing on `refx-ca-east-bhs` surfaced and fixed root causes the static
audit couldn't see. **Reach servers via:** node update to **agent ≥ v1.1.7** +
reseed + reinstall.

- **Platform / `getpwuid` SIGSEGV (agent v1.1.6)** — game containers ran as a uid
  with no `/etc/passwd` entry; `steamclient.so` segfaults on the NULL. This silently
  broke **every Steam-API game** (mis-attributed as game bugs). Agent now mounts a
  generated passwd/group. **Verified:** Arma 3, Rust, TF2 boot.
- **`steamcmd` not on PATH (18 eggs)** — installs failed `steamcmd: command not
  found`; added a bootstrap shim. **Verified:** Rust, TF2 install.
- **Quote-aware startup splitting (agent v1.1.7)** — `strings.Fields` shredded
  quoted args, so spaced server names/passwords never applied. Fixes **ARK,
  Valheim, Palworld** names/passwords with no per-egg change.
- **`steamclient.so` SDK setup** — added to **TF2 (BLOCKER, verified), KF2, Mordhau,
  Satisfactory** (was WARN #1).
- **Rust** — empty rcon password crashed `Init_Tier0`; `refx-rust.sh` generates one.
  **Verified live.**
- **Config templating (WARN #2)** — seeded configs from vars for **7DtD, Unturned,
  tModLoader, Mordhau, Squad, Project Zomboid, Conan, Astroneer, Enshrouded, ATS**
  (+ Palworld/ARK/Valheim via the quote fix). *Not yet node-verified — smoke-test.*
- **Project Zomboid heap (WARN #3)** — `-Xmx` now set from `SERVER_MEMORY`; also
  fixed `-servername` misuse (stable preset `refx`, display name in `PublicName`).
- **minecraft-paper** — ported to PaperMC **v3** (v2 retired 2026-07-01).
- **Seed propagation** — create-only sync now migrates existing servers to launcher
  startups too.

**Still open:** FiveM dead artifact URL; ATS needs client-exported `server_packages.*`;
Conan/Astroneer/Enshrouded wine paths + headless Proton; CS2 `LD_LIBRARY_PATH` (test
first). These remain HOLD until smoke-tested.

## ✅ Fixed at source (original audit)

| Game | Bug | Fix |
|------|-----|-----|
| **V Rising** | `steamAppId 1604030` is the game *client* (needs ownership) — anonymous download fails, no server binary | → **1829350** (dedicated server tool) + `xvfb-run` |
| **Arma Reforger** | `steamAppId 1890870` is wrong — `app_update` installs nothing | → **1874900** |
| **Squad** | startup runs `./SquadServer.sh` — file doesn't exist | → **`./SquadGameServer.sh`** |
| **Valheim** | startup missing `SteamAppId=892970` + `LD_LIBRARY_PATH=./linux64` (won't load `libsteam_api`); Default image `lloesche/valheim-server` has its own entrypoint and ignores the egg | → prepend the env; Default image → `steamcmd:debian` |

## 🔴 BLOCKERs still to fix (need a node smoke-test)

| Game | Issue | Fix |
|------|-------|-----|
| **Team Fortress 2** | srcds hard-fails without `steamclient.so` in `~/.steam/sdk32` + `sdk64` | Install: `mkdir -p ~/.steam/sdk32 ~/.steam/sdk64 && cp linux32/steamclient.so ~/.steam/sdk32/ && cp linux64/steamclient.so ~/.steam/sdk64/` |
| **FiveM** | artifact URL is dead — `.../master/fx.tar.xz` and `.../master/<build>/fx.tar.xz` both 404; the path needs the `<build>-<hash>` dir | Resolve the recommended build dynamically (scrape the artifacts index) and require the full `build-hash` |
| **Conan Exiles** | startup `wine ConanSandboxServer.exe` — wrong path; real exe is `ConanSandbox/Binaries/Win64/ConanSandboxServer-Win64-Shipping.exe`, and needs `xvfb-run` + a wine-capable image | Fix path + `xvfb-run`; verify the image actually has `wine`+`xvfb` |
| **Astroneer** | startup `wine AstroServer.exe` — `steamcmd:proton` has no bare `wine`; exe is `Astro/Binaries/Win64/AstroServer-Win64-Shipping.exe`; headless Proton is known-flaky | `proton run ./Astro/Binaries/Win64/AstroServer-Win64-Shipping.exe`; **smoke-test heavily or delist** |
| **DayZ** | install defaults to `+login anonymous`, but 223350 needs a Steam account that **owns** DayZ → silently produces an empty server dir; also `serverDZ.cfg` is never seeded | Require a game-download Steam login for this egg + fail loudly if missing; seed `serverDZ.cfg` |
| **minecraft-paper** (standalone) | uses Paper **v2 API**, disabled **2026-07-01** → installs 404 within days | Port to `fill.papermc.io/v3`, or retire it and route customers to the unified **minecraft** egg with `LOADER=paper` |
| **Arma Reforger** | `-config ./configs/server.json` but no `server.json` is generated → won't start | Generate `configs/server.json` from the vars in install |

## 🟠 Cross-cutting WARNs (functional, fix before/just-after launch)

1. **`steamclient.so` SDK setup missing** on all Steam-API eggs (TF2 hard-fails — above; **KF2, Mordhau, Satisfactory** at risk). Add the sdk32/64 copy to each.
2. **Customer settings ignored** — many eggs declare `SERVER_NAME / MAX_PLAYERS / *_PASSWORD` etc. but never write them into a config file (`configFiles.find` is empty `{}`, and the config often doesn't exist until first boot). Affected: **Unturned, Astroneer, Mordhau (MAX_PLAYERS), ATS, tModLoader, 7 Days to Die, Squad (RCON/name), Arma 3 (server.cfg), ~~Palworld (RCON/admin ini)~~, Conan (admin/RCON), Enshrouded, Project Zomboid**. Fix: seed/template each config from the vars in the install script.
   **Update (July 2026):** the Pterodactyl-style `{path, parser, find}` entries were worse than inert — the agent decoded them as **empty content and truncated the target config to 0 bytes on every install and preserve-data reinstall** (customer settings destroyed). Fixed three ways: all 28 parser-style `configFiles` entries stripped from the seed templates; the agent now skips empty-content entries (`renderConfigFiles`, regression-tested); and **Palworld** got the full treatment — its install script seeds `PalWorldSettings.ini` from the game's defaults and writes the panel-owned keys into the ini at install/reinstall, and boot runs `PalServer.sh` **directly** (only `-port` + perf flags, no gameplay CLI flags), so the ini is authoritative (Palworld silently prefers CLI flags over the ini, which made customer ini edits appear ignored). An earlier per-boot launcher (`refx-palworld-run.sh`) was dropped: SteamCMD `validate` on reinstall could leave the launcher file missing, crashing the next boot — moving the sync into the install script removes that dependency. The seed's launcher-migration now also heals servers *off* a stale `refx-*` snapshot. The remaining eggs on the "settings ignored" list still need their vars wired into configs, but nothing destroys customer configs anymore.
3. **Project Zomboid heap** — `SERVER_MEMORY` never patched into `ProjectZomboid64.json` vmArgs → server ignores the tier's RAM (OOM on bigger plans).
4. **Windows-server-on-Linux** (Conan, Astroneer, V Rising, Enshrouded) — need Proton/Wine **and** a virtual display (`xvfb-run`) and a verified image; the riskiest group — smoke-test each.
5. **`startupDetect` accuracy** — several (Mordhau, Unturned, tModLoader, FiveM, TF2-with-no-GSLT) may never match the real "ready" line → panel hangs in "starting". Verify each against a live boot log.
6. **Missing `chmod +x`** on KF2 / Mordhau binaries (boot fails if the exec bit isn't preserved).
7. **CS2** — launch the `cs2.sh` wrapper (or export `LD_LIBRARY_PATH`) instead of the raw binary to avoid the empty-`LD_LIBRARY_PATH` segfault.
8. **Minecraft Forge/NeoForge Java cap** — the resolver never passes a lower Java cap for Forge/NeoForge; safe for the `1.21.1` default, but a "latest" that lands on a calendar version could mis-pick Java 25.

## 🧩 Platform-level (latent, currently benign)

- **`installScript.container` is ignored** — the agent's `InstallScript` struct uses JSON key `image` (`apps/node-agent/internal/server/spec.go`), but eggs use `container`, so the field is dropped and the install falls back to the **runtime** image (`docker.go`). Harmless today because every egg's install container ≈ its runtime image, but it will silently break any future egg that needs a distinct install image. Fix: map `container`→`image` when the panel builds the install spec (or accept both keys in the Go struct).

## ✅ Clean (no blockers found)

Rust, ARK, Palworld, Satisfactory, Killing Floor 2, Garry's Mod, CS2 (with the
wrapper note), American Truck Simulator, TeamSpeak 3, Terraria, the unified
**Minecraft** egg (Vanilla/Paper/Fabric/Forge/NeoForge via the resolver),
Minecraft-Fabric/Forge/NeoForge — all install + boot; remaining items are WARN-level
(config templating, detect lines).

## Recommended go-live order

1. **Launch with a curated subset** you've smoke-tested: Minecraft (unified), Rust,
   Valheim, Palworld, ARK, CS2, Garry's Mod, Satisfactory, Terraria, TeamSpeak —
   the anonymous-Steam + native-Linux games are lowest-risk.
2. **Hold the Windows-via-Proton games** (Conan, Astroneer, V Rising, Enshrouded)
   and **owned-account games** (DayZ, Arma 3/Reforger) until each passes a node
   smoke-test with the fixes above.
3. Fix the `steamclient.so` setup and config-templating sweep, then widen the catalog.

_Audit date: 2026-06-26. Verified Steam app ids + download URLs against live sources._
