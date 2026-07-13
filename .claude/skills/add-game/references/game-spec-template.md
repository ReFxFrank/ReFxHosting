# Game spec sheet — `<game-slug>`

Copy this file and fill in every field. A blank field is a support ticket waiting to happen. Anything you cannot verify from an official source becomes a `TODO(frank)` line — never a guess.

On refx.gg this sheet is the **research artifact that precedes the egg**: once it's complete, its values become the egg JSON at `database/seed/templates/<slug>.json` and the `GameTemplate` row's recommended specs (`recCpuCores`/`recMemoryMb`/`recDiskMb`, which also *drive the price* — see `add-game` Phase 2 and Phase 4). Keep the filled sheet alongside the skill for the next audit.

## Identity

| Field | Value |
|---|---|
| Display name | |
| Slug (URL + panel key) | |
| Search aliases | e.g. "7d2d", "cs2", "asa" |
| Category | survival / sandbox / FPS / simulation / voice / other |
| Official server docs URL | |
| Steam AppID (server) | |
| Steam AppID (game, if different) | |

## Licence gate (Phase 0)

| Question | Answer | Source |
|---|---|---|
| Paid third-party hosting permitted? | | EULA § |
| Operator may install binaries on customer's behalf? | | |
| SteamCMD `+login anonymous` works? | | |
| Branding usable on marketing pages? | | |
| Any player-count / price caps imposed by the publisher? | | |

## Runtime

| Field | Value | Notes |
|---|---|---|
| Server software | official dedicated / community (name + repo) | |
| Runtime dependency | Java 21 / .NET / Wine / native | Wine-based servers are a category of pain — flag them |
| Base image needed | | |
| Install method | SteamCMD / direct download / package | |
| Update method | | Does an update wipe configs? |
| Graceful stop command | `stop` / `quit` / `end` / SIGINT | A SIGKILL corrupts saves — this field is mandatory |
| "Server ready" log line | | Panel done-detection depends on this exact string |
| Query protocol | A2S / SLP / HTTP / none | Drives player-count display |
| Console input supported? | yes/no | If no, the panel console is read-only — say so in the docs |

## Ports

| Purpose | Default | Protocol | Configurable? |
|---|---|---|---|
| Game | | UDP/TCP | |
| Query | | | |
| RCON | | | |
| Other (specify) | | | |

Every port must be a variable. If the game hardcodes a port or requires a contiguous range (common with Source-engine and Unreal titles), record that here — it constrains the allocator.

## Resources — measured, not guessed

Boot a real server and measure. Fill in the table from observation.

| Players | RAM used (idle) | RAM used (loaded) | CPU | Notes |
|---|---|---|---|---|
| 0 | | | | |
| 10 | | | | |
| 25 | | | | |
| 50 | | | | |

| Field | Value |
|---|---|
| Absolute RAM floor (will not boot below) | |
| Recommended RAM default for the default plan | |
| Disk footprint (fresh install) | |
| Disk growth per week of play (estimate) | |
| Single-threaded or multi-threaded? | Most game servers are single-thread-bound — clock speed beats core count |

## Configuration surface

| File | Path | Format | Settings customers actually change |
|---|---|---|---|
| | | properties/ini/json/toml/yaml | |

## Mods / plugins

| Field | Value |
|---|---|
| Modding supported? | |
| Modloader(s) | |
| Mod source | Steam Workshop / CurseForge / Modrinth / manual |
| Does the client need matching mods? | **Critical** — this drives half of all "can't connect" tickets |
| Workshop auth needed? | |

## Backups

| Include | Exclude |
|---|---|
| saves/world data, configs, mods | caches, logs, re-downloadable binaries/depots |

List the actual paths.

## Known gotchas

Anything that surprised you during onboarding. Feed the nastiest ones straight into `server-triage/references/known-issues.md`.
