# Game egg backlog

Tracks requested game templates ("eggs"). Each egg lives in
`database/seed/templates/<slug>.json` and, on the next demo seed
(`SEED_DEMO=true`), automatically gets a purchasable per-slot package
(`gs-<slug>`) via `seedPerSlotProducts()`.

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

> Vanilla Terraria already shipped as `terraria` (`terraria.json`); `tmodloader`
> is the modded variant.

## To do

Each needs: a verified dedicated-server install path, the correct startup
command, and per-slot resource sizing. The "blocker" column is why it isn't
done yet.

| Game | Likely approach | Blocker / to verify |
|------|-----------------|---------------------|
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
3. Re-run the seed with `SEED_DEMO=true`. A `gs-<slug>` per-slot product +
   per-interval pricing is created automatically; tune it in Admin → Products.
4. Optional: drop art at `apps/web/public/games/<slug>.svg` (falls back to a
   default otherwise).
