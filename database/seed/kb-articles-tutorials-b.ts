/**
 * Knowledge-base tutorials, batch B — long-form "how to host X" guides for the
 * survival/factory games plus platform guides (game switching, TeamSpeak, SRV
 * records). Same contract and markdown subset as kb-articles.ts; seed the same
 * way (upsert by slug).
 *
 * Markdown subset only (see apps/web/components/shared/markdown.tsx):
 * ##/### headings, paragraphs, -/1. lists, **bold**, `code`, fenced blocks,
 * > quotes, [links](/path), --- dividers. No tables/images/HTML.
 */
import type { KbSeedArticle } from "./kb-articles";

export const KB_TUTORIALS_B: KbSeedArticle[] = [
  {
    slug: "host-palworld-dedicated-server",
    title: "How to host a Palworld dedicated server — settings and save transfer",
    category: "Guides",
    body: `Palworld's built-in co-op tops out at four players and only exists while the host's machine is on. A dedicated server raises the cap to 32, keeps the world online around the clock, and gives you full control over rates, death penalties, and PvP. This guide covers ordering a server, editing \`PalWorldSettings.ini\` correctly (the step most people get wrong), setting up admin access, and moving an existing co-op world onto the server.

## Prerequisites

- A Palworld server plan — 8 GB RAM is the floor, 16 GB is comfortable (see the FAQ)
- Palworld on Steam for every player who will join
- For a save transfer: access to the save folder on the machine that hosted your co-op world

## Step by step

### 1. Order the server

Pick a plan on the [Palworld page](/games/palworld) and choose the region closest to your group — Palworld is UDP-based and latency-sensitive in combat. ReFx provisions the server instantly; when the install finishes you'll have a connection address like \`abc123.fra.refx.gg:8211\` on the server overview. Port **8211/UDP** is the game port; the query port (**27015/UDP**) and RCON port (**25575/TCP**) are allocated alongside it.

### 2. Know your two config files

The install directory contains \`DefaultPalWorldSettings.ini\` in the root. This file is a **reference only** — the server never reads it. The live config is:

\`\`\`
Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
\`\`\`

(On a Windows-hosted server the path ends in \`WindowsServer\` instead of \`LinuxServer\`.) A fresh install ships this file nearly empty, which is why so many servers silently run pure defaults.

### 3. Configure PalWorldSettings.ini

Stop the server, open the file manager (or SFTP), and copy the entire \`OptionSettings=(...)\` line out of \`DefaultPalWorldSettings.ini\` into \`PalWorldSettings.ini\` under the section header. Then edit values. Trimmed example — your real file should keep **every** key from the default line:

\`\`\`ini
[/Script/Pal.PalGameWorldSettings]
OptionSettings=(ServerName="ReFx Palworld",ServerDescription="Friends only",AdminPassword="ChangeMe-Admin",ServerPassword="ChangeMe-Join",ServerPlayerMaxNum=32,ExpRate=1.500000,PalCaptureRate=1.000000,DeathPenalty=Item,RCONEnabled=True,RCONPort=25575,PublicPort=8211)
\`\`\`

Rules that trip people up:

- **Everything lives on one line.** \`OptionSettings\` is a single tuple; a line break inside it makes the server ignore the whole file and boot with defaults.
- \`DeathPenalty\` accepts \`None\`, \`Item\`, \`ItemAndEquipment\`, or \`All\`.
- \`ServerPassword\` gates joining; \`AdminPassword\` gates admin commands and RCON. Set both, and don't reuse one for the other.
- Recent builds also expose \`RESTAPIEnabled\`/\`RESTAPIPort=8212\` (a local HTTP admin API) and \`CrossplayPlatforms=(Steam,Xbox,PS5,Mac)\` — leave crossplay alone unless you actually have console players.

Restart after saving. Rate changes (\`ExpRate\`, \`PalCaptureRate\`, day/night speed) apply to the existing world without a wipe.

### 4. Set up admin access

In-game, open chat and authenticate with the admin password:

\`\`\`
/AdminPassword ChangeMe-Admin
\`\`\`

You can then use \`/ShowPlayers\`, \`/KickPlayer <SteamID>\`, \`/BanPlayer <SteamID>\`, \`/Broadcast <message>\`, \`/Save\`, and \`/DoExit\`. With \`RCONEnabled=True\` the same commands work from any RCON client against port 25575 — useful for scripted saves and announcements.

### 5. Transfer your co-op world (optional)

Palworld world saves are portable folders. On the old host machine, find the world at:

\`\`\`
%LOCALAPPDATA%\\Pal\\Saved\\SaveGames\\<your SteamID64>\\<world id>\\
\`\`\`

The folder (a 32-character hex name) contains \`Level.sav\`, \`LevelMeta.sav\`, \`WorldOption.sav\`, and a \`Players/\` directory. To move it:

1. Stop the dedicated server.
2. Upload the whole world folder into \`Pal/Saved/SaveGames/0/\` on the server via SFTP.
3. Edit \`Pal/Saved/Config/LinuxServer/GameUserSettings.ini\` and point the server at it: \`DedicatedServerName=<that 32-character folder name>\`.
4. Start the server and confirm the world loads.

> Known caveat: in a co-op save, the **host's** character is stored under an internal player ID that doesn't match their real Steam ID on a dedicated server, so the host may spawn as a fresh character while guests keep theirs. The community tool \`palworld-host-save-fix\` rewrites the save to repair this — run it before uploading if the co-op host wants to keep their character.

### 6. Connect

Steam → Palworld → **Join Multiplayer Game** → enter \`address:8211\` in the direct-connect box at the bottom (plus the server password if set). Direct connect is the reliable path; the in-game community browser only lists servers that registered with Palworld's public lobby and is easy to get lost in.

## Troubleshooting

- **Settings don't apply** — you edited \`DefaultPalWorldSettings.ini\`, edited the live file while the server was running, or broke the single-line rule. Stop, fix, start.
- **Memory climbs over time** — Palworld's server is known to bloat with uptime. Schedule a nightly restart (ReFx's Schedules tab does this in two clicks) and the problem disappears; crash auto-restart catches the rare hard fall in the meantime.
- **Progress lost after a crash** — the world saves on interval and on graceful shutdown. Get in the habit of \`/Save\` before risky moments, and always stop the server from the panel rather than killing it.
- **Friends can't see the server in the browser** — skip the browser; direct connect by \`address:8211\` always works.

## Frequently asked

### How much RAM does a Palworld server need?

Start at 8 GB for a handful of players. Memory grows with explored map, base count, and uptime — 16 GB with a nightly restart is the comfortable setup for a 10–30 player world. ReFx RAM is dedicated, so what you buy is what the server actually gets.

### Can Xbox or Game Pass friends join?

On current builds, dedicated servers can opt into console crossplay via \`CrossplayPlatforms=(Steam,Xbox,PS5,Mac)\` inside \`OptionSettings\`. Steam-to-Steam works out of the box. Console crossplay has extra constraints that shift between patches, so check the notes for the build you're running.

### Can I change rates after the world exists?

Yes. Stop the server, edit the values, start again — multipliers apply to the existing world immediately. Take a one-click backup first if you're experimenting; if you later outgrow Palworld entirely, [game switching](/knowledge-base/switch-server-game-keep-backups) lets you swap the same server to another game without losing those backups.

Ready to build? [Order a Palworld server](/games/palworld) and be in-game in minutes.`,
  },
  {
    slug: "host-rust-server-wipes-plugins",
    title: "How to host a Rust server — wipe schedules and Oxide/Carbon plugins",
    category: "Guides",
    body: `Running Rust is less about the first boot and more about the rhythm: monthly forced wipes, a convar-driven config, and a plugin ecosystem (Oxide/uMod or Carbon) that has to track every Facepunch patch. This guide sets up the server properly and then covers the two things every Rust owner must actually operate — wipes and plugins.

## Prerequisites

- A Rust server plan with at least 8 GB RAM (12–16 GB for a 4000+ map with plugins)
- Rust on Steam; the client and server must be on the same protocol version
- Your SteamID64 (from your Steam profile URL or steamid.io) for admin setup

## Step by step

### 1. Order and provision

Order on the [Rust page](/games/rust) and pick the region where your players live — Rust PvP punishes ping. Provisioning is instant, but note the **first boot generates the procedural map**, which is CPU-heavy and can take several minutes; ReFx plans include burst CPU headroom precisely for spikes like this. Rust servers are also a favorite DDoS target, so hosting behind network-level DDoS protection is not optional.

Default ports: **28015/UDP** (game), **28016/TCP** (RCON/web RCON), plus optionally **28017/UDP** as a dedicated Steam query port and **28082/TCP** for the Rust+ companion app.

### 2. Configure identity, seed, and size

Everything lives under the server's identity folder — \`server/<identity>/\` (on ReFx, \`server/rust/\`). Your editable config is \`server/<identity>/cfg/server.cfg\`; the sibling \`serverauto.cfg\` is machine-written at shutdown and should never be hand-edited.

\`\`\`
server.hostname "ReFx | Fresh Wipe | Solo/Duo/Trio"
server.description "Wipes Thursdays 18:00 UTC\\nActive non-playing admin"
server.url "https://example.com"
server.headerimage "https://example.com/banner.jpg"
server.maxplayers 100
server.worldsize 4000
server.seed 1847203
server.saveinterval 300
\`\`\`

- \`server.worldsize\` ranges 1000–6000; 3500–4500 is the sweet spot for population vs. RAM.
- \`server.seed\` is any positive 32-bit integer; the same seed and size regenerate the same map layout.
- The hostname is your storefront in the server browser — state your wipe schedule in it.

### 3. Make yourself admin

Add a line to \`server/<identity>/cfg/users.cfg\`:

\`\`\`
ownerid 76561198000000000 "YourName" "server owner"
\`\`\`

(\`moderatorid\` grants a lower tier.) Alternatively type \`ownerid 76561198000000000\` into the server console and persist it with \`server.writecfg\`. Reconnect to pick up the role, then use the F1 console in-game. For remote administration, set \`rcon.password\` and connect a web RCON client to port 28016.

### 4. Understand the wipe cycle

Two different things get wiped:

- **Map wipe** — deletes the world and everything built on it. The map lives in the identity folder as paired files like \`proceduralmap.4000.1847203.224.map\` and \`.sav\`. Delete both (or just change the seed) and the next boot generates fresh terrain.
- **Blueprint wipe** — deletes learned crafting knowledge, stored in \`player.blueprints.<protocol>.db\`. Delete it only when you want a true fresh start.

**Forced wipe** happens the first Thursday of every month (around 18:00–19:00 UTC) when Facepunch ships the monthly update: the protocol bumps, old maps become incompatible, and every server must map-wipe. Blueprint wipes are only forced a few times a year. Between forced wipes, most community servers choose weekly, biweekly, or monthly map wipes — pick one cadence, put it in the hostname, and never surprise your population.

Practical routine on ReFx: take a one-click backup, stop the server, delete the map files in the file manager (plus the blueprint db if it's a full wipe), update the server, start. Schedules can handle the restart timing; the update itself lands on Thursday, so plan to be around.

### 5. Install Oxide or Carbon

Vanilla Rust has no plugin API. **Oxide** (distributed via uMod) is the long-standing framework; **Carbon** is a newer alternative that runs most Oxide plugins unchanged. Pick one — never both.

Oxide install, generically:

1. Stop the server.
2. Download the latest Oxide.Rust release **matching your server's current build**.
3. Extract it over the server root — it replaces files under \`RustDedicated_Data/Managed/\`.
4. Start once; an \`oxide/\` tree appears with \`plugins/\`, \`config/\`, \`data/\`, and \`logs/\`.

Drop \`.cs\` plugin files into \`oxide/plugins/\` — they hot-compile within seconds, no restart needed. Each plugin writes a JSON config into \`oxide/config/\` on first load. Permissions are managed from the console:

\`\`\`
oxide.usergroup add YourName admin
oxide.grant group default kits.use
\`\`\`

The recurring gotcha: **every Rust update overwrites Oxide's patched assemblies.** After each patch (especially forced-wipe Thursday), reinstall the matching Oxide build before players pile in, or the server boots vanilla and every plugin is silently absent.

### 6. Connect

Players find you in the in-game browser, or press F1 and run \`client.connect your.address:28015\`. Note that running Oxide/Carbon with gameplay-affecting plugins moves you from the Community tab to the **Modded** tab — that's a browser-placement rule, not a punishment.

## Troubleshooting

- **"Wrong version" on join** — client and server protocol differ. Update the server (and then Oxide/Carbon) after every Rust patch.
- **Plugins not loading** — watch the live console for compile errors as the \`.cs\` file drops; missing dependencies and stale API calls are the usual causes. \`oxide/logs/\` has the detail.
- **Server invisible in the browser** — the Steam list lags several minutes after boot; direct \`client.connect\` while you wait.
- **Long first boot** — that's map generation, not a hang. Watch the console; subsequent boots reuse the saved map.

## Frequently asked

### Do I really have to wipe every month?

The map, yes — the monthly forced update makes old maps incompatible, so a map wipe is effectively mandatory. Blueprints are yours to keep unless Facepunch forces a BP wipe, which is rare and announced.

### Can I keep the same map across wipes?

Keep the same \`server.seed\` and \`server.worldsize\` and the world regenerates with identical terrain (buildings still vanish). This holds until Facepunch changes world generation, which typically happens a few times a year.

### Oxide or Carbon?

Oxide has the deepest plugin catalog and documentation; Carbon is faster-moving and runs most of the same plugins. For a first server, Oxide is the safer default. Either way the update-after-patch discipline in step 5 applies.

Ready to wipe in style? [Order a Rust server](/games/rust) — instant setup, DDoS protection, and a file manager that makes wipe day a two-minute job. If your group ever rotates games, [switching the same server to another title](/knowledge-base/switch-server-game-keep-backups) keeps your address and backups.`,
  },
  {
    slug: "host-valheim-server-crossplay",
    title: "How to host a Valheim server with crossplay",
    category: "Guides",
    body: `A Valheim dedicated server keeps your world alive while the host sleeps and lets up to 10 vikings build in it. The one decision that actually matters at setup time is **crossplay**: it decides which network backend the server uses, who can join, and how your latency behaves. This guide covers setup, the crossplay trade-off honestly, and moving an existing world onto the server.

## Prerequisites

- A Valheim server plan — 4 GB RAM is fine for vanilla, 6–8 GB for mods or years-old sprawling worlds
- Valheim on Steam (or Xbox/PC Game Pass for crossplay joiners)
- For a world transfer: the \`.db\` and \`.fwl\` files from the machine that hosted it

## Step by step

### 1. Order and provision

Order on the [Valheim page](/games/valheim). Provisioning is instant; the server overview shows your address. Valheim uses **2456/UDP** (game) and **2457/UDP** (query) by default — both are allocated for you.

### 2. Understand the launch arguments

Valheim's dedicated server is configured almost entirely by launch flags, not a config file:

\`\`\`
./valheim_server.x86_64 -nographics -batchmode \\
  -name "ReFx Vikings" -port 2456 -world "Midgard" \\
  -password "longboat" -public 1 -crossplay \\
  -saveinterval 1800 -backups 4
\`\`\`

On ReFx these map to panel fields (server name, world name, password, public flag) under Startup settings — edit them there rather than hunting for a script. Two hard rules the server enforces by refusing to boot:

- The password must be **at least 5 characters**.
- The password must **not be contained in the server name** (name "longboat crew" + password "longboat" fails).

\`-public 1\` lists you in the community browser; \`-public 0\` keeps the server joinable only by people who know the address or code.

### 3. Decide on crossplay

The \`-crossplay\` flag switches networking from Steamworks to Microsoft's PlayFab backend:

- **With \`-crossplay\`**: Xbox and PC Game Pass players can join, and the server prints a six-digit **join code** in the log on every boot (find it in the live console — it changes each restart). Traffic is relayed through PlayFab, which typically adds some latency for everyone, including Steam players.
- **Without it**: Steam-only, direct sockets, the lowest ping. Steam players join via the server browser or direct address.

Honest guidance: if everyone is on Steam, leave crossplay **off** — you're paying a latency tax for nothing. Turn it on only when you actually have console/Game Pass players. Note that most BepInEx mod setups assume the Steam backend and identical client mods, so modded servers and crossplay rarely mix.

### 4. Transfer an existing world (optional)

Valheim worlds are two files: \`<WorldName>.db\` (the world data) and \`<WorldName>.fwl\` (its metadata). On the old host machine they live at:

\`\`\`
C:\\Users\\<you>\\AppData\\LocalLow\\IronGate\\Valheim\\worlds_local\\
\`\`\`

(Check the legacy \`worlds\` folder too on old installs, and note Steam Cloud can hide the newest copy — launch the game once with cloud sync off if the files look stale.) Then:

1. Stop the server.
2. Upload **both** files into the server's \`worlds_local\` directory via SFTP or the file manager.
3. Set the world name in your startup settings to the exact file basename — it's case-sensitive: files named \`Midgard.db\`/\`Midgard.fwl\` need \`-world "Midgard"\`.
4. Start and verify the world loads instead of generating a fresh one.

### 5. Add admins

Drop SteamID64s (one per line) into \`adminlist.txt\` in the server's config directory. Admins press F5 in-game for the console: \`kick <name/steamid>\`, \`ban <name/steamid>\`, \`banned\` to review. \`bannedlist.txt\` and \`permittedlist.txt\` (a whitelist) sit alongside.

### 6. Connect

- **Steam players**: the in-game community list works but is slow to search; faster is Steam → View → Game Servers → Favorites → add \`address:2457\` (the query port), then join from the Valheim main menu.
- **Crossplay players**: main menu → Join Game → enter the current join code from the console.

The world saves every 30 minutes by default (tunable via \`-saveinterval\`, in seconds) and on shutdown — stop the server from the panel, never kill it mid-save.

## Troubleshooting

- **Server exits seconds after boot** — password rule violation (too short, or contained in the server name). Fix the two fields.
- **A fresh world generated instead of mine** — world name doesn't exactly match the file basename, or you uploaded only one of the two files.
- **Nobody can find the server** — give the list a few minutes after boot, use the Steam favorites method with port 2457, or just share the join code / direct address.
- **Console friends can't join** — the server isn't running \`-crossplay\`, or they're typing an old join code; it rotates every restart.

## Frequently asked

### How many players can join?

Valheim's hard cap is 10 concurrent players regardless of hardware. More than that requires mods, with all the compatibility caveats that implies.

### Does crossplay make the server slower?

It routes traffic through PlayFab's relay instead of direct Steam sockets, which usually costs some ping. World simulation speed is unaffected. Steam-only groups should leave it off.

### How do backups work for Valheim?

The world is just \`.db\` + \`.fwl\`, so any file-level backup captures it. On ReFx, one-click and scheduled backups snapshot the server (with an offsite Express add-on if you want copies off the node) — worth automating before big terraforming sessions. Enjoying the genre? [Enshrouded hosts just as easily](/knowledge-base/host-enshrouded-server).

Raise your longhouse: [order a Valheim server](/games/valheim) and it's live before your coffee cools.`,
  },
  {
    slug: "host-ark-survival-evolved-server",
    title: "How to host an ARK: Survival Evolved server",
    category: "Guides",
    body: `ARK: Survival Evolved remains one of the most-hosted survival games because official rates are grindy and unofficial servers fix that. A dedicated server gives you your own rates, your own mod list, and a world that keeps breeding dinos while you sleep. This guide covers the two config files that control everything, Workshop mods, admin setup, and moving a single-player world onto the server.

## Prerequisites

- An ARK server plan — 8 GB RAM minimum, 10–12 GB once you stack mods
- ARK: Survival Evolved on Steam for every player
- Your SteamID64 for the admin whitelist

Note: this guide is for **Survival Evolved** (ASE). ARK: Survival Ascended (ASA) is a separate game with separate servers.

## Step by step

### 1. Order and provision

Order on the [ARK page](/games/ark-survival-evolved). Provisioning is instant, though ARK's install is one of the largest in gaming — the download takes a while even on fast nodes. Default ports: **7777/UDP** (game), **7778/UDP** (raw socket, always game port + 1), **27015/UDP** (Steam query), **27020/TCP** (RCON).

Pick your map at order time or in Startup settings — \`TheIsland\`, \`Ragnarok\`, \`Valguero_P\`, \`CrystalIsles\`, \`LostIsland\`, \`Fjordur\`, or a DLC/mod map. Changing maps later keeps each map's world save separate.

### 2. Tune GameUserSettings.ini

The main config is \`ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini\` (edit with the server **stopped** — ARK rewrites it on shutdown and will clobber live edits):

\`\`\`ini
[ServerSettings]
ServerAdminPassword=ChangeMe-Admin
ServerPassword=
DifficultyOffset=1.000000
OverrideOfficialDifficulty=5.0
HarvestAmountMultiplier=2.0
TamingSpeedMultiplier=3.0
XPMultiplier=2.0
ActiveMods=731604991,1404697612

[/Script/Engine.GameSession]
MaxPlayers=20

[SessionSettings]
SessionName=ReFx ARK
\`\`\`

\`DifficultyOffset=1.0\` plus \`OverrideOfficialDifficulty=5.0\` gives wild dinos up to level 150, the unofficial standard. Breeding, engram, and per-level multipliers live in the sibling \`Game.ini\` under \`[/script/shootergame.shootergamemode]\`:

\`\`\`ini
[/script/shootergame.shootergamemode]
MatingIntervalMultiplier=0.5
EggHatchSpeedMultiplier=10.0
BabyMatureSpeedMultiplier=10.0
bDisableStructurePlacementCollision=true
\`\`\`

### 3. Install Workshop mods

\`ActiveMods\` is a comma-separated, **order-sensitive** list of Steam Workshop IDs (the number in each mod's Workshop URL) — map-extension and core mods first. The server also needs the mod content itself in \`ShooterGame/Content/Mods/\`: either run with \`-automanagedmods\` so it downloads from the Workshop at boot, or copy the mod folders from a client install.

On ReFx this is the one-click path: the panel's Workshop installer searches the Workshop, downloads the mod server-side, and appends the ID to \`ActiveMods\` in the right place. Players need the same mods — ARK downloads missing ones on join, but it's slow; tell your group to subscribe beforehand.

### 4. Set up admin access

In-game, open the console (Tab) and authenticate:

\`\`\`
enablecheats ChangeMe-Admin
\`\`\`

Then \`cheat\` commands work (\`cheat saveworld\`, \`cheat broadcast\`, \`cheat destroywilddinos\` after difficulty changes), and \`showmyadminmanager\` opens the built-in admin UI. To skip typing the password every session, add SteamID64s (one per line) to \`ShooterGame/Saved/AllowedCheaterSteamIDs.txt\`. RCON is available on 27020 with the same admin password for scripted saves and broadcasts.

### 5. Transfer a single-player world (optional)

Single-player worlds live inside your client install:

\`\`\`
Steam\\steamapps\\common\\ARK\\ShooterGame\\Saved\\SavedArksLocal\\
\`\`\`

The server's equivalent folder is \`ShooterGame/Saved/SavedArks/\`. To transfer:

1. Stop the server.
2. Upload the map save (for example \`TheIsland.ark\`) plus the \`.arkprofile\` and \`.arktribe\` files into \`SavedArks/\`.
3. Make sure the server runs the **same map** as the save file.
4. Characters are the messy part: single-player stores yours as \`LocalPlayer.arkprofile\`, while a dedicated server expects \`<YourSteamID64>.arkprofile\`. Rename the file accordingly — structures, dinos, and tribes transfer reliably; the character link works in most cases but be prepared to respawn and have an admin restore levels if it doesn't.

### 6. Connect

The in-game "Unofficial" browser is notoriously flaky. The dependable route is Steam → View → Game Servers → Favorites → add \`address:27015\` (the query port), then the server appears in ARK's session list with your filters set to show favorites. Password-protected servers prompt on join.

## Troubleshooting

- **Server invisible in the unofficial list** — use the Steam favorites method above; the in-game browser drops thousands of servers arbitrarily.
- **Crash loop after adding a mod** — a mod is missing from \`Content/Mods\`, the ID order is wrong, or two mods conflict. Remove the newest addition, boot, re-add one at a time.
- **Wild dinos still low level after difficulty changes** — run \`cheat destroywilddinos\` once; existing spawns keep their old levels until culled.
- **Config edits vanish** — you edited \`GameUserSettings.ini\` while the server was running. Stop first, edit, start.

## Frequently asked

### ASE or ASA — does this guide apply to both?

No. ASA (Survival Ascended) is a separate game on Unreal Engine 5 with its own server binary, mod system (CurseForge, not Steam Workshop), and networking. Everything here is for Survival Evolved.

### Can Epic Games Store players join?

Yes, if the server runs with the \`-crossplay\` flag — with one hard limit: Epic clients cannot use Steam Workshop mods, so crossplay only works cleanly on unmodded servers.

### How much RAM does ARK need?

8 GB runs a vanilla island map for a small tribe. Every mod, higher player counts, and long uptimes push that up — 10–12 GB with dedicated allocation (which is what ReFx provides) keeps a modded map stable. Project Zomboid players will find the [same Workshop workflow here](/knowledge-base/host-project-zomboid-server).

Tame something huge: [order an ARK server](/games/ark-survival-evolved) with one-click Workshop mods and instant setup.`,
  },
  {
    slug: "host-enshrouded-server",
    title: "How to host an Enshrouded server",
    category: "Guides",
    body: `Enshrouded's dedicated server is refreshingly simple: one JSON config file, two UDP ports, and a role-based password system instead of admin commands. This guide covers ordering, the \`enshrouded_server.json\` file in detail, moving a local co-op save to the server, and the honest limits (16 slots, no RCON).

## Prerequisites

- An Enshrouded server plan — 8 GB RAM is a sensible floor, 16 GB if you expect all 16 slots
- Enshrouded on Steam for each player
- For a save transfer: access to the old machine's \`Saved Games\` folder

## Step by step

### 1. Order and provision

Order on the [Enshrouded page](/games/enshrouded). Provisioning is instant. Enshrouded's server ships as a Windows binary; on Linux nodes ReFx runs it under Wine/Proton automatically — you'll see some Wine chatter in the console log, and it's harmless. Default ports: **15636/UDP** (game) and **15637/UDP** (query).

### 2. Configure enshrouded_server.json

Everything lives in \`enshrouded_server.json\` in the server root. Stop the server before editing — it reads the file at boot. A working example:

\`\`\`json
{
  "name": "ReFx Embervale",
  "saveDirectory": "./savegame",
  "logDirectory": "./logs",
  "ip": "0.0.0.0",
  "gamePort": 15636,
  "queryPort": 15637,
  "slotCount": 16,
  "gameSettingsPreset": "Default",
  "userGroups": [
    {
      "name": "Admin",
      "password": "ChangeMe-Admin",
      "canKickBan": true,
      "canAccessInventories": true,
      "canEditBase": true,
      "canExtendBase": true,
      "reservedSlots": 1
    },
    {
      "name": "Friend",
      "password": "ChangeMe-Friend",
      "canKickBan": false,
      "canAccessInventories": true,
      "canEditBase": true,
      "canExtendBase": false,
      "reservedSlots": 0
    },
    {
      "name": "Guest",
      "password": "ChangeMe-Guest",
      "canKickBan": false,
      "canAccessInventories": false,
      "canEditBase": false,
      "canExtendBase": false,
      "reservedSlots": 0
    }
  ]
}
\`\`\`

Key points:

- **Roles replace admin commands.** Whichever password a player types on join decides their group and permissions (\`canKickBan\`, base editing, inventory access). Very early builds used a single flat \`"password"\` field; current builds use \`userGroups\`.
- \`slotCount\` caps at **16** — that's an engine limit, not a plan limit.
- \`gameSettingsPreset\` accepts \`Default\`, \`Relaxed\`, \`Hard\`, \`Survival\`, or \`Custom\`; with \`Custom\` you add a \`gameSettings\` block of numeric factors (enemy damage, resource drop amounts, day length and similar) to fine-tune difficulty.
- Leave \`ip\` on \`0.0.0.0\` — the panel's allocation handles the public address.

Mind the JSON: a trailing comma or missing quote makes the server fall back to defaults or fail to boot. The file manager's editor highlights JSON, which helps.

### 3. Transfer a local co-op save (optional)

Local saves live on the hosting player's machine at:

\`\`\`
C:\\Users\\<you>\\Saved Games\\Enshrouded\\
\`\`\`

Saves are hex-named files (a base file like \`3ad85aea\`, numbered rollback copies, and a matching \`_info\` file). To move a world:

1. Start the dedicated server once so it creates its own files under \`savegame/\`, then stop it.
2. Note the exact base filename the server created.
3. Copy your local save files into \`savegame/\`, renaming them so the base name (and its \`_info\` companion) match what the server had.
4. Keep a copy of the originals, start the server, and verify your base and characters are there.

Character progression in multiplayer is stored inside the server's world save, so your group's progress travels with these files — take a one-click backup before and after the swap.

### 4. Connect

In-game, choose **Play** → **Join** and search the exact server name from your config, then enter the password for your role (this is how the game decides you're Admin, Friend, or Guest). You can also add \`address:15637\` under Steam → View → Game Servers → Favorites to keep it bookmarked.

## Troubleshooting

- **Server not found by name** — give the listing a few minutes after boot, search the exact string from \`"name"\`, and double-check the server actually started (console shows the world loading).
- **Password rejected** — you're typing a group password that no longer exists; after updates that migrated \`password\` to \`userGroups\`, old flat passwords stop working. Check the JSON.
- **Changes didn't apply** — the file was edited while the server ran, or the JSON is invalid and the server silently used defaults. Validate and restart.
- **Save transfer produced a fresh world** — filenames don't match what the server expects; redo step 3 exactly, including the \`_info\` file.

## Frequently asked

### Can I raise the 16-player cap?

No — 16 is Enshrouded's engine-side maximum for dedicated servers. Size your plan for RAM per concurrent player instead; 16 active builders is when 16 GB pays off.

### Are there admin commands or RCON?

No console, no RCON. Moderation is the \`canKickBan\` permission on the Admin group, used from the in-game player list. Keep the Admin password tight and rotate it if it leaks — it's the only privilege system the game has.

### Does the server run mods?

There's no official mod support for dedicated servers. Unofficial pak-file mods exist but break on every patch; treat them as unsupported. If your group wants deeper server modding, [Valheim](/knowledge-base/host-valheim-server-crossplay) or [Palworld](/knowledge-base/host-palworld-dedicated-server) are friendlier targets.

Light the flame: [order an Enshrouded server](/games/enshrouded) and be exploring the Shroud in minutes.`,
  },
  {
    slug: "host-project-zomboid-server",
    title: "How to host a Project Zomboid multiplayer server",
    category: "Guides",
    body: `Project Zomboid multiplayer is built around a trio of config files that share your server's name, a sandbox file that controls every difficulty knob, and Steam Workshop mods referenced by two different kinds of ID. Get those three things right and PZ is one of the smoothest games to host. This guide walks through all of it, plus moving a co-op save onto a dedicated server.

## Prerequisites

- A Project Zomboid server plan — 4 GB RAM for vanilla, 6–8 GB with a serious mod list (PZ runs on Java, so memory matters)
- Project Zomboid on Steam for every player
- Your mod list's Workshop IDs and Mod IDs (they differ — see step 4)

## Step by step

### 1. Order and provision

Order on the [Project Zomboid page](/games/project-zomboid). Provisioning is instant. PZ uses **16261/UDP** as its main port and **16262/UDP** for direct player connections — both are allocated for you.

### 2. Find your config trio

PZ names its config files after the server name passed at launch (the \`-servername\` flag; the default is \`servertest\`). In \`Zomboid/Server/\` you'll find:

- \`servertest.ini\` — server settings (name, slots, mods, PvP)
- \`servertest_SandboxVars.lua\` — world difficulty settings
- \`servertest_spawnregions.lua\` / \`servertest_spawnpoints.lua\` — spawn locations

Check your Startup settings for the actual \`-servername\` value; the file prefix always matches it. The essentials in the \`.ini\`:

\`\`\`ini
PVP=false
PauseEmpty=true
Public=true
PublicName=ReFx Knox County
PublicDescription=Slow-burn survival. Fresh spawns welcome.
Password=
MaxPlayers=16
Open=true
Map=Muldraugh, KY
Mods=
WorkshopItems=
SaveWorldEveryMinutes=10
BackupsCount=5
DefaultPort=16261
UDPPort=16262
UPnP=false
\`\`\`

\`PauseEmpty=true\` freezes the clock when nobody's online — most friend groups want that so loot and seasons don't march on overnight.

### 3. Tune the sandbox

\`servertest_SandboxVars.lua\` is where the game actually gets easier or harder. Edit with the server stopped:

\`\`\`lua
SandboxVars = {
    VERSION = 5,
    Zombies = 3,          -- population: 1 insane .. 5 none
    Distribution = 1,     -- urban focused
    DayLength = 3,        -- 3 = one-hour days
    XpMultiplier = 1.5,
    ZombieLore = {
        Speed = 2,        -- 1 sprinters, 2 fast shamblers, 3 shamblers
        Strength = 2,
        Toughness = 2,
        Transmission = 1, -- blood + saliva
        Cognition = 3,
        Memory = 2,
    },
    ZombieConfig = {
        PopulationMultiplier = 1.0,
        RespawnHours = 72.0,
    },
}
\`\`\`

Most values here bake into the save at world creation; population and respawn settings can be adjusted later, but lore changes on an existing world can behave inconsistently — decide your zombie rules before launch day.

### 4. Add Workshop mods

Every mod needs **two** entries, both semicolon-separated:

- \`WorkshopItems=\` — the Workshop ID from the mod's Steam URL
- \`Mods=\` — the Mod ID printed in the mod's Workshop description (often a word, not a number)

\`\`\`ini
WorkshopItems=1234567890;2345678901
Mods=BetterSorting;SomeWeaponPack
\`\`\`

Mismatched pairs are the number-one PZ support ticket. On ReFx, the Workshop one-click installer handles both fields (and their order) for you. Map mods additionally need a \`Map=\` entry listed **before** \`Muldraugh, KY\`. Players don't need to pre-install anything — the server pushes mod downloads on join. When a mod updates on the Workshop, restart the server so it pulls the new version, otherwise joiners get version-mismatch kicks.

### 5. Set up admin

Set the admin password via the panel's admin-password variable (it maps to the \`-adminpassword\` launch flag); the account is named \`admin\`. Log in with those credentials in-game, then:

- \`/setaccesslevel "username" admin\` — promote a friend (levels: admin, moderator, overseer, gm, observer)
- \`/players\`, \`/kickuser\`, \`/banuser\`, \`/teleport\` — day-to-day moderation
- The in-game **Admin panel** button covers most of it with a UI

Player accounts are simple username/password pairs created on first join and stored server-side in \`Zomboid/db/servertest.db\`.

### 6. Transfer a co-op save (optional)

If you've been hosting from the game client, your world lives on that machine:

\`\`\`
C:\\Users\\<you>\\Zomboid\\Saves\\Multiplayer\\<savename>\\
C:\\Users\\<you>\\Zomboid\\db\\<savename>.db
\`\`\`

Stop the server, upload the save folder to \`Zomboid/Saves/Multiplayer/\` and the \`.db\` to \`Zomboid/db/\`, renaming both to match the server's \`-servername\` if it differs. Keep the mod list identical to what the save was created with, then start and verify.

### 7. Connect

In-game: **Join** → **Add server**, enter the address and port 16261, pick a username and password (this creates your account), and connect. With \`Public=true\` the server also appears in the in-game browser under its \`PublicName\`.

## Troubleshooting

- **Kicked on join with a mod error** — a \`Mods=\`/\`WorkshopItems=\` pair is mismatched or a mod updated; fix the pair or restart the server to pull updates.
- **Server starts then stops immediately** — read the console; the usual culprits are a syntax error in \`SandboxVars.lua\` or a broken \`Map=\` line.
- **World didn't transfer** — the save folder or db name doesn't match \`-servername\` exactly.
- **Stutters with many players** — PZ is Java; give it headroom. Dedicated RAM plans (no oversell) matter more here than raw CPU clock.

## Frequently asked

### Can I wipe the map but keep everyone's accounts?

Yes. Stop the server and delete \`Zomboid/Saves/Multiplayer/<servername>/\` but leave \`Zomboid/db/<servername>.db\`. Fresh Knox County, same logins.

### Build 41 or Build 42?

Match the server to whatever branch your players run — saves and mods are not compatible across builds. Pin your group to one branch in Steam's beta settings and update together.

### How many players can PZ handle?

\`MaxPlayers\` is yours to set; 16–32 runs comfortably on a well-specced plan. Very large populations need mod-assisted tuning and generous RAM. ARK owners will recognize [the same Workshop workflow](/knowledge-base/host-ark-survival-evolved-server).

This is how you died — on your own terms: [order a Project Zomboid server](/games/project-zomboid).`,
  },
  {
    slug: "host-7-days-to-die-server",
    title: "How to host a 7 Days to Die server",
    category: "Guides",
    body: `7 Days to Die configures everything through a single XML file, keys its save folders to two properties most people don't know about (\`GameWorld\` and \`GameName\`), and hides its admin system in a second XML in the save directory. This guide covers all of it: setup, world generation choices, admin access, EAC and mods, and transferring a local save to the server.

## Prerequisites

- A 7 Days to Die server plan — 8 GB RAM minimum; add more for big random-gen maps and high zombie counts
- 7 Days to Die on Steam for every player
- Your SteamID64 for admin setup

## Step by step

### 1. Order and provision

Order on the [7 Days to Die page](/games/seven-days-to-die). Provisioning is instant. The server listens on **26900/TCP** plus **26900–26903/UDP** — allocated for you, nothing to forward.

### 2. Configure serverconfig.xml

The whole server is defined by \`serverconfig.xml\` in the install root — a flat list of \`<property>\` lines. Edit with the server stopped. The ones that matter:

\`\`\`xml
<property name="ServerName" value="ReFx Navezgane"/>
<property name="ServerPassword" value=""/>
<property name="ServerMaxPlayerCount" value="8"/>
<property name="ServerVisibility" value="2"/>
<property name="GameWorld" value="Navezgane"/>
<property name="WorldGenSeed" value="refxseed"/>
<property name="WorldGenSize" value="6144"/>
<property name="GameName" value="Season1"/>
<property name="GameDifficulty" value="2"/>
<property name="DayNightLength" value="60"/>
<property name="BloodMoonFrequency" value="7"/>
<property name="EACEnabled" value="true"/>
<property name="TelnetEnabled" value="true"/>
<property name="TelnetPort" value="8081"/>
<property name="TelnetPassword" value="ChangeMe-Telnet"/>
\`\`\`

The two identity properties trip everyone up:

- \`GameWorld\` picks the **map**: \`Navezgane\` (hand-built), one of the shipped pregenerated worlds, or \`RWG\` for random generation using \`WorldGenSeed\` + \`WorldGenSize\` (6144 and 8192 are the common sizes; bigger sizes multiply the first-boot generation time).
- \`GameName\` names the **save**. Change it and the server starts a brand-new game on the same map. It also seeds decoration placement in RWG, so treat it as part of your world's identity.

\`ServerVisibility\` is 2 (public list), 1 (friends), or 0 (unlisted — players direct-connect). \`DayNightLength\` is real minutes per in-game day; \`BloodMoonFrequency\` is days between hordes.

### 3. Set up admins

Admin rights live in \`serveradmin.xml\` inside the save/user-data directory (its location is governed by the \`UserDataFolder\` property; on Linux installs the default is \`~/.local/share/7DaysToDie\` — if you don't see a \`Saves\` folder next to the server files, that property is where to look). Add yourself:

\`\`\`xml
<users>
  <user platform="Steam" userid="76561198000000000" name="you" permission_level="0" />
</users>
\`\`\`

Permission level 0 is full admin. In-game, press F1 for the console: \`dm\` (debug menu), \`cm\` (creative), \`settime day\`, \`kick\`, \`ban add\`, and \`admin add <steamid> <level>\` once you already have access. The Telnet listener (port 8081) accepts the same commands remotely — set a strong \`TelnetPassword\`, since it's plain TCP.

### 4. Decide on EAC and mods

\`EACEnabled\` controls Easy Anti-Cheat:

- **XML-only modlets** (loot tables, recipes, spawning) work fine with EAC **on**, server-side only.
- **DLL/Harmony mods** (new mechanics, UI overhauls) require EAC **off** on both server and clients, and usually a matching client-side install.

Mods go in a \`Mods/\` folder in the server root. Public servers generally keep EAC on and stick to XML modlets; private friend servers turn it off and mod freely.

### 5. Transfer a local save (optional)

On your PC, saves live at:

\`\`\`
%APPDATA%\\7DaysToDie\\Saves\\<WorldName>\\<SaveName>\\
\`\`\`

and randomly generated worlds at \`%APPDATA%\\7DaysToDie\\GeneratedWorlds\\<WorldName>\\\`. To move to the server:

1. Stop the server.
2. Upload the save folder into the server's \`Saves/<WorldName>/<SaveName>/\` (create the world folder to match).
3. If the world was RWG, **also** upload the matching \`GeneratedWorlds/<WorldName>/\` folder — the save is useless without its world data.
4. Set \`GameWorld\` and \`GameName\` in \`serverconfig.xml\` to those exact names.
5. Start and verify you spawn at your old base, not a beach.

### 6. Connect

Players find the server in the in-game browser (visibility 2) or press F1 and run \`connect your.address:26900\`. Password-protected servers prompt on join.

## Troubleshooting

- **Fresh world instead of my transferred save** — \`GameWorld\`/\`GameName\` don't match the uploaded folder names, or the \`GeneratedWorlds\` folder is missing for an RWG save.
- **First boot takes forever on RWG** — world generation is a one-time, CPU-heavy job (burst CPU headroom helps here); 8192 maps can take a long while. Subsequent boots are fast.
- **Players kicked by EAC** — EAC is on while DLL mods are installed, or a client launched with EAC disabled against an EAC-on server. Align both sides.
- **Horde-night lag** — lower \`MaxSpawnedZombies\`, shrink \`WorldGenSize\` next season, or move up a RAM tier; blood moons are the load test.

## Frequently asked

### Navezgane or random gen?

Navezgane is the polished, hand-made map — great first season. RWG gives every wipe a new map at the cost of a long first generation and a slightly rougher world. Most long-running servers alternate seasons by changing \`GameName\` and the seed.

### Can I change settings mid-save?

Most gameplay properties (difficulty, day length, blood-moon cadence, loot) apply to the existing save on restart. World identity (\`GameWorld\`, seed, size) cannot change without starting a new save.

### How do wipes work here compared to Rust?

Nothing is forced — you wipe when you choose by changing \`GameName\` (new save) or deleting the save folder. Take a one-click backup first so any season can be restored; Rust owners live a stricter version of this in [our Rust wipe guide](/knowledge-base/host-rust-server-wipes-plugins).

Survive the seventh night: [order a 7 Days to Die server](/games/seven-days-to-die) and it's live in minutes.`,
  },
];
