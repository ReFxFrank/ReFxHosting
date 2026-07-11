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
];
