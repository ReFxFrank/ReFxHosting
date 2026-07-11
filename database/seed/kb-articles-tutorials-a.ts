/**
 * Tutorial-style knowledge-base articles, batch A — long-form hosting guides
 * for the modpacks and setup questions server owners search for. Seeded
 * alongside database/seed/kb-articles.ts by the KB seeder.
 *
 * Markdown subset only (see apps/web/components/shared/markdown.tsx):
 * ##/### headings, paragraphs, -/1. lists, **bold**, `code`, fenced blocks,
 * > quotes, [links](/path), --- dividers. No tables/images/HTML.
 */

import type { KbSeedArticle } from "./kb-articles";

export const KB_TUTORIALS_A: KbSeedArticle[] = [
  {
    slug: "host-medieval-mc-server",
    title: "How to host a Medieval MC (MMC4) server: RAM, crashes and JVM flags",
    category: "Minecraft",
    body: `Medieval MC (Medieval Minecraft) turns the game into a medieval RPG: hundreds of custom structures, overhauled combat, dungeons and bosses. It is also one of the heavier community packs to host, and most "my Medieval MC server keeps crashing" reports come down to three causes — too little memory, client-only mods sitting in the server's \`mods/\` folder, or world generation outrunning the vanilla watchdog. This guide walks through a clean setup and the fix for each crash.

One naming note before you download anything: each Medieval MC generation pins a single Minecraft version, and **MMC4 is the 1.19.2 generation**, published in separate **Forge** and **Fabric** editions. The server must run the same edition and the same pack version as every player, so confirm the exact version string on the pack's CurseForge file page first — mixing files from different MMC generations is a guaranteed crash.

## Prerequisites

- The exact pack file your players use (edition and version, e.g. Medieval MC [FORGE] 1.19.2)
- **Java 17** — Minecraft 1.19.2 refuses older runtimes
- **6 GB RAM as a floor, 8 GB recommended** (details below)
- A host with real file access (file manager or SFTP), or a spare machine

## RAM requirements

Medieval MC is worldgen-heavy. Structure and dungeon generation spikes memory hard while players explore — well beyond what the freshly booted server shows.

- 2–4 players, casual play: **6 GB** works, **8 GB** is comfortable
- 5–10 players or heavy exploration: **8–10 GB**
- 10+ players or lots of elytra travel: **12 GB**

Two details matter more than the raw number. First, the JVM heap (\`-Xmx\`) must stay 1–2 GB below your total RAM or the OS kills the process from the outside — our [OutOfMemoryError guide](/knowledge-base/minecraft-server-out-of-memory-xmx-guide) explains the mechanics. Second, packs sometimes ship their own memory settings in \`user_jvm_args.txt\` that silently override yours; step 6 covers it.

## Step by step

1. **Get the server files.** Check the pack's CurseForge page for a dedicated server pack download. If there is none, download the client pack and assemble the server by hand with steps 2–4.
2. **Install the loader.** For the Forge edition, run the Forge 1.19.2 installer with \`java -jar forge-1.19.2-43.x.x-installer.jar --installServer\`, using the exact build the pack pins (check \`manifest.json\`). For the Fabric edition, run the Fabric installer in server mode, which produces \`fabric-server-launch.jar\`.
3. **Upload the content.** Copy \`mods/\`, \`config/\`, \`defaultconfigs/\` and (if present) \`kubejs/\` from the pack into the server directory.
4. **Strip client-only mods.** Shaders, minimaps and UI mods crash dedicated servers on boot. Delete them from the server's \`mods/\` folder — our [client-side mod crash guide](/knowledge-base/forge-clientside-mod-crash-dedicated-server) lists the usual offenders.
5. **Accept the EULA.** Start once, let it exit, then set \`eula=true\` in \`eula.txt\`.
6. **Set memory flags.** Forge 1.19.2 reads JVM flags from \`user_jvm_args.txt\` — put \`-Xms8G\` and \`-Xmx8G\` there (one flag per line) and delete any memory lines the pack shipped. Fabric takes flags on the start command instead.
7. **First boot.** Expect 3–8 minutes while registries and structures load. If it crashes, the last \`Caused by:\` line in the log names the culprit.
8. **Tune \`server.properties\`.** Sensible starting values: \`view-distance=8\`, \`simulation-distance=6\`, and \`max-tick-time=-1\` (explained below).

## JVM flags that hold up

Use Aikar's flags, sized to your plan. In \`user_jvm_args.txt\` on the Forge edition they look like this:

\`\`\`
-Xms8G
-Xmx8G
-XX:+UseG1GC
-XX:+ParallelRefProcEnabled
-XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions
-XX:+DisableExplicitGC
-XX:+AlwaysPreTouch
-XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40
-XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20
-XX:InitiatingHeapOccupancyPercent=15
\`\`\`

The complete list, the 12 GB+ variant and what each flag does are in our [Aikar's flags guide](/knowledge-base/jvm-flags-modded-minecraft-aikars).

## The three classic Medieval MC crashes

### 1. Out of memory

\`java.lang.OutOfMemoryError: Java heap space\` mid-session means the heap is too small for the structure generation this pack does. Raise \`-Xmx\` and the plan behind it — 4 GB genuinely does not survive group exploration here.

### 2. Client-only mod on the server

A boot crash naming a specific mod, with \`This mod is for clientside use only\` or \`Attempted to load class ... for invalid dist DEDICATED_SERVER\`, means a client mod is in \`mods/\`. Delete the named jar, restart, repeat until the boot is clean.

### 3. Watchdog kill during worldgen

\`\`\`
A single server tick took 60.00 seconds (should be max 0.05)
Considering it to be crashed, server will forcibly shutdown.
\`\`\`

Vanilla's watchdog assumes a long tick is a hang, but Medieval MC legitimately spends seconds generating castle-sized structures. Set \`max-tick-time=-1\` in \`server.properties\` to disable the watchdog, then pre-generate terrain so the long ticks stop happening at all: with the Chunky mod installed, run \`chunky radius 3000\` and \`chunky start\` from the console while nobody is online.

Reusing a world from another pack or version adds a fourth crash family — datapack and dimension errors, covered in [this guide](/knowledge-base/minecraft-failed-to-load-datapacks-missing-dimensions).

## Frequently asked

### Will Medieval MC run on 4 GB?

It boots. It then dies the first time three players explore in different directions. 6 GB is the honest floor; 8 GB makes the problem go away.

### Forge or Fabric edition?

Whichever your players run — they are separate packs with separate content, and clients on one edition cannot join a server on the other. Starting fresh, the Fabric edition is a little lighter on the same hardware.

### What do players need to join?

The same pack, same edition, same version, installed through the CurseForge app or an equivalent launcher, plus your server address. Nothing else is required from them.

---

On ReFx, Medieval MC installs from the panel in one click — we resolve the loader, strip client-only mods and neutralize the pack's JVM overrides automatically. [Minecraft plans here](/games/minecraft).`,
  },
  {
    slug: "host-all-the-mods-10-server",
    title: "How to host an All the Mods 10 (ATM10) server",
    category: "Minecraft",
    body: `All the Mods 10 (ATM10) is the current kitchen-sink pack of the ATM line: 400+ mods on **Minecraft 1.21.1** with the **NeoForge** loader. Hosting it is more straightforward than most heavy packs because the team publishes proper server files — but it is unforgiving about two things: the Java version and the RAM you give it. Here is the full setup, plus the errors you will actually hit.

## Prerequisites

- **Java 21.** Minecraft 1.21.1 requires it; Java 17 will not even load the jar (exact error below).
- **10–12 GB RAM recommended.** 8 GB boots but struggles past a couple of players; plan 16 GB if you expect 8+ online.
- The **server files**, not the client pack. On the pack's CurseForge page, each release has a matching \`Server Files\` zip under additional files.

## Step by step

1. **Download the server files** for the exact version your players run — an ATM10 client on one release needs the server files from the same release.
2. **Extract the zip** into your server directory. You get \`mods/\`, \`config/\`, \`defaultconfigs/\`, \`kubejs/\`, start scripts (\`start.sh\`, \`start.bat\`) and a \`variables.txt\`.
3. **Accept the EULA**: set \`eula=true\` in \`eula.txt\` (the start script exits or prompts otherwise).
4. **Set your memory in \`variables.txt\`** — see the next section.
5. **Run the start script.** The first run downloads the pinned NeoForge build and its libraries, then boots the server. On a panel host that uses its own startup command, install the same NeoForge version and keep your flags in \`user_jvm_args.txt\` instead.
6. **Wait out the first boot.** 5–15 minutes is normal while 400+ mods register and \`config/\` populates. Don't kill the process because the console goes quiet.
7. **Open the port and join.** Default is \`25565/tcp\`. Players connect with the identical ATM10 client version.

## Inside variables.txt

ATM server packs are generated with ServerPackCreator, and the start scripts read their settings from \`variables.txt\`. Trimmed to the lines that matter:

\`\`\`
MINECRAFT_VERSION=1.21.1
MODLOADER=NeoForge
MODLOADER_VERSION=21.1.x
JAVA_ARGS="-Xms10G -Xmx10G -XX:+UseG1GC -XX:+ParallelRefProcEnabled ..."
RESTART=true
\`\`\`

Edit \`JAVA_ARGS\` to match your machine, and leave 1–2 GB of headroom below the machine or container total — [here is why that headroom matters](/knowledge-base/minecraft-server-out-of-memory-xmx-guide). If you host on a panel that injects \`-Xmx\` itself, make sure only one memory setting survives; duplicate flags mean the last one silently wins.

## Verify Java 21

Run \`java -version\` where the server runs. If the server dies instantly with something like:

\`\`\`
java.lang.UnsupportedClassVersionError: ... has been compiled by a more recent
version of the Java Runtime (class file version 65.0), this version of the
Java Runtime only recognizes class file versions up to 61.0
\`\`\`

decode it as: class file 65 = Java 21, class file 61 = Java 17. The machine is still on Java 17 — install a Java 21 runtime (Temurin 21 is the usual pick) or switch the Java version in your panel's startup settings.

## Performance tuning that actually moves the needle

- **Pre-generate chunks.** First-week exploration is the single biggest lag source in kitchen-sink packs. With a pregeneration mod such as Chunky, run \`chunky radius 2500\` then \`chunky start\` overnight before opening the server.
- **Trim distances** in \`server.properties\`: \`view-distance=8\` and \`simulation-distance=6\` are sane for ATM10.
- **Profile before deleting mods.** Recent ATM releases ship the spark profiler (add it if yours doesn't): \`/spark tps\` shows tick health, \`/spark profiler\` names the mod eating your ticks.
- **Restart on a schedule.** Heavy packs accumulate leaks; a daily restart at a quiet hour keeps memory flat.

## Updating the pack without losing the world

1. Take a full backup (world plus configs).
2. Download the new Server Files zip.
3. Replace \`mods/\`, \`config/\`, \`defaultconfigs/\` and \`kubejs/\`. Keep \`world/\`, \`server.properties\`, \`ops.json\`, \`whitelist.json\`, \`eula.txt\` and any configs you edited deliberately.
4. Boot once and read the log before players join — pack updates occasionally remove world content, and the ATM changelogs call those cases out.

## Troubleshooting

- **\`java.lang.OutOfMemoryError: Java heap space\`** — raise \`-Xmx\` in \`JAVA_ARGS\`; 10 GB is the realistic floor for a populated ATM10 server.
- **Players time out on first join** — big packs sync a lot of data at login; have them retry once, and keep \`view-distance\` at 8 or below so the initial chunk send is smaller.
- **\`Can't keep up! Is the server overloaded?\` log spam** — that is CPU, not RAM. Pre-generate, lower \`simulation-distance\`, and run \`/spark profiler\` to find the hot mod.
- **Boot crash naming a mod you added** — hand-added client mods crash dedicated servers; see the [client-only mod guide](/knowledge-base/forge-clientside-mod-crash-dedicated-server).

## Frequently asked

### How much RAM does ATM10 really need?

8 GB for a solo test world, 10–12 GB for a small group, 16 GB when 8+ players explore simultaneously. Under-allocating shows up as GC stutter long before it crashes.

### Can friends join with plain NeoForge and no pack?

No. Every content mod must exist on both sides with matching versions, or the login fails with a registry/channel mismatch. The client needs the full ATM10 pack at the same version.

### Do I have to pre-generate chunks?

No, but it converts "the server stutters whenever anyone explores" into a one-time overnight job. For a public server it is the highest-value hour you will spend.

---

On ReFx, ATM10 installs in one click from the Modpacks tab — server files, NeoForge version and memory flags handled for you. [Minecraft plans here](/games/minecraft).`,
  },
  {
    slug: "host-better-mc-server",
    title: "How to host a Better MC server (BMC4 and BMC5)",
    category: "Minecraft",
    body: `Better MC (BMC) is a family of adventure packs rather than a single pack: there are **Forge**, **Fabric** and **NeoForge** editions, heavier **BMC Plus** variants, and a generation number that pins the Minecraft version — BMC4 files target 1.20.1, the BMC5 line targets 1.21.x. Most failed BMC servers die at step zero: the server is running a different edition or generation than the players. So the first job is identifying precisely which file your group uses.

## Prerequisites

- The exact edition and version your players installed (e.g. Better MC [FORGE] BMC4) — read it off the CurseForge file page, not from memory
- **Java 17** for the 1.18.2/1.19.2/1.20.1 generations, **Java 21** for 1.21+
- **6 GB RAM floor, 8 GB recommended**; BMC Plus or 8+ players: 10 GB
- File manager or SFTP access to the server

## Step by step

1. **Download the matching server pack.** On the pack's CurseForge Files tab, most BMC releases publish a server pack alongside the client file — take the one with the same version number. If your version has none, assemble it from the client pack using our [modpack install guide](/knowledge-base/install-curseforge-modrinth-modpack-on-server).
2. **Extract it** into the server directory and check what shipped: you want \`mods/\`, \`config/\`, \`defaultconfigs/\` and any \`kubejs/\` or \`global_packs/\` folders.
3. **Install the pinned loader.** Forge/NeoForge: run the installer with \`--installServer\`; your JVM flags then live in \`user_jvm_args.txt\`. Fabric: the installer's server mode produces \`fabric-server-launch.jar\` and flags go on the start command.
4. **Strip client-only mods if you hand-assembled.** BMC ships minimap, animation and visual mods that crash a dedicated server on boot — the [client-side mod crash guide](/knowledge-base/forge-clientside-mod-crash-dedicated-server) shows how to spot and remove them. Published server packs have this done already.
5. **Accept the EULA** (\`eula=true\` in \`eula.txt\`) and set memory: \`-Xms6G\` / \`-Xmx6G\` minimum, 8G if you have it, always 1–2 GB under the machine total.
6. **First boot and tune.** In \`server.properties\` start with \`view-distance=8\`, \`simulation-distance=6\`, \`max-tick-time=-1\`.
7. **Lock the door while you test**: \`white-list=true\`, then \`whitelist add YourName\` from the console.

## Structure lag: the BMC signature problem

BMC's identity is exploration — it stacks structure and worldgen mods (the YUNG's / When Dungeons Arise class of generators) on top of new biomes. The cost is that generating fresh chunks is expensive, and the symptom is TPS dips exactly when players push into new terrain.

Three fixes, in order of value:

1. **Pre-generate** the region players will actually use: \`chunky radius 3000\`, \`chunky start\`, leave it overnight.
2. **Keep \`view-distance\` at 8 or below** — chunk load scales with the square of it.
3. **Restart daily** at a quiet hour; long-running worldgen-heavy servers fragment memory.

## Updating BMC without breaking the world

- Back up first — world and configs.
- Update the server only to the version players updated to; a half-updated group produces login mismatch errors.
- Replace \`mods/\`, \`config/\` and \`defaultconfigs/\`; keep \`world/\`, \`server.properties\`, \`ops.json\`, \`whitelist.json\`.
- Read the changelog for removed worldgen or dimension mods before booting: content the world references but no longer exists causes datapack and dimension errors on load. If you hit those, work through the crash rather than deleting the world blindly.

## Troubleshooting

- **Players get a mod list or registry error on join** — server and client pack versions differ. Align both to the same release.
- **Boot crash naming a mod** — client-only mod on the server; delete the named jar and restart.
- **\`java.lang.OutOfMemoryError: Java heap space\`** — BMC on 4–5 GB dies during group exploration; move to 6–8 GB.
- **Long first boot** — normal. BMC generations boot in 2–6 minutes on decent hardware; only investigate if the log stops advancing for 10+ minutes.

## Frequently asked

### BMC or BMC Plus for a server?

Plus variants add content and RAM cost — treat their floor as 8 GB and their comfortable allocation as 10 GB. Hosting steps are identical.

### Can Bedrock players join a BMC server?

No. Modded Java packs are Java-only; proxy tools that translate Bedrock clients cover vanilla-compatible servers, not mod content.

### Do shaders need anything on the server?

Nothing. Shaders and resource packs are pure client-side — and uploading them to the server's \`mods/\` folder is a common way to crash it.

---

On ReFx, pick any Better MC edition from the one-click CurseForge installer and switch loaders later from the panel without losing your address or backups. [Minecraft plans here](/games/minecraft).`,
  },
  {
    slug: "minecraft-server-ram-requirements",
    title: "How much RAM does a Minecraft server actually need?",
    category: "Minecraft",
    body: `Every host sells RAM tiers, so "how much RAM do I need" is really "which plan do I buy" — and most answers online are either upsells or copy-pasted guesses. Here are working numbers from real servers, the two levers that change them, and the cases where more RAM will not help at all.

## What actually consumes memory

- **Loaded chunks.** Every player keeps a square of chunks in memory; the radius is \`view-distance\` in \`server.properties\`.
- **Entities.** Mobs, dropped items, minecarts and block entities inside those chunks.
- **Mods and plugins.** Registered content, caches, and whatever the mod author never frees.
- **The JVM itself.** Threads, GC structures and network buffers live outside the game heap — which is why the heap must be smaller than the plan.

## The numbers

Vanilla and plugin servers:

- Vanilla, 2–5 players: **2–3 GB**
- Vanilla or Paper, ~10 players: **3–4 GB**
- Paper with 20–40 plugins, ~20 players: **4–6 GB**

Modded servers:

- Light Fabric setup (performance and QoL mods): **4 GB**
- Mid-size packs (the Better MC / Medieval MC class): **6–8 GB**
- Kitchen-sink packs (All the Mods 10 and friends): **10–12 GB**
- Expert and tech monsters (GregTech: New Horizons): **12–16 GB**

Past the first five concurrent players, budget roughly **50–100 MB per additional player** — more if they scatter across the map instead of building together, because scattered players load disjoint chunk squares.

## View distance is the multiplier everyone ignores

Chunks loaded per player = (2 × view-distance + 1)². At \`view-distance=10\` that is 441 chunks per player; at 6 it is 169. Ten scattered players at view distance 10 hold ~4,400 chunks; at 6, ~1,700. Dropping from 10 to 7 routinely saves an entire plan tier of memory, and most players cannot tell the difference on a survival server. \`simulation-distance\` matters too, but it mostly costs CPU rather than RAM.

## What more RAM will not fix

Low TPS with \`Can't keep up! Is the server overloaded?\` scrolling in the log is a CPU problem — too many entities, too much worldgen, one misbehaving mod. Extra memory prevents crashes and GC thrash; it does not make ticks compute faster. If TPS is bad while the memory graph sits flat, profile with spark (\`/spark tps\`, \`/spark profiler\`) instead of upgrading.

Signs you genuinely need more RAM:

- Crash reports ending in \`java.lang.OutOfMemoryError: Java heap space\`
- A sawtooth memory graph pinned near the top, with players freezing rhythmically as the GC runs back-to-back
- You switched to a heavier modpack tier

## Plan RAM vs -Xmx: they are not the same number

The heap flag \`-Xmx\` decides what the server may use, and it does not automatically track your plan. Set it 1–2 GB (or ~15%) below the plan so the JVM's own overhead fits; setting \`-Xmx\` to 100% of the container just converts heap errors into the OS killing the process. Stale start scripts and modpack-shipped \`user_jvm_args.txt\` files are the classic causes of a tiny heap on a big plan — the full diagnosis is in our [OutOfMemoryError guide](/knowledge-base/minecraft-server-out-of-memory-xmx-guide), and sensible flags to pair with the heap are in the [Aikar's flags guide](/knowledge-base/jvm-flags-modded-minecraft-aikars).

On ReFx the heap is derived from your plan automatically with headroom reserved, and plan RAM is dedicated — the number you buy is the number you get.

## Choosing a starting size

1. Match your content tier from the lists above.
2. Add for concurrency: +1 GB per ~10 extra players on plugin servers, more on modded.
3. Start one notch lower than you think and watch the memory graph for a week — upgrading later is a button, and real usage beats forum guesses.

## Frequently asked

### Is 1 GB enough for a vanilla server?

On modern versions, no — 1.18+ worldgen alone spikes past it and the server stalls in GC. 2 GB is the honest minimum for a small vanilla world; old versions (1.8–1.12) do run in 1 GB.

### Does Paper need less RAM than vanilla?

A little, but Paper's real wins are CPU-side: faster ticks and better chunk handling at the same memory. Run it for performance, not to buy a smaller plan — the [server type comparison](/knowledge-base/paper-vs-fabric-vs-forge-vs-neoforge-server) covers the tradeoffs.

### Should I add RAM or lower view distance first?

Lower \`view-distance\` first — it is free, takes one restart, and shrinks both memory and CPU load. Add RAM when crash reports or the memory graph say so, not preemptively.

---

Know your tier? [Pick a Minecraft plan with exactly that much dedicated RAM](/games/minecraft).`,
  },
  {
    slug: "transfer-singleplayer-world-to-server",
    title: "How to transfer a singleplayer world to a Minecraft server",
    category: "Minecraft",
    body: `Your singleplayer world outgrew "Open to LAN" and you want it running on a real server so friends can join anytime. The move is a folder copy at heart, but the details — version rules, where \`level.dat\` must sit, how Paper splits dimensions — are where transfers go wrong. This is the complete procedure.

## Before you start: two version rules

- **The server must run the same or a newer Minecraft version than the world.** Worlds upgrade forward automatically; they never downgrade. A 1.21.1 world will not load on a 1.20.4 server.
- **A vanilla world loads on any server type** (Vanilla, Paper, Fabric, Forge, NeoForge). A **modded** world only loads on a server with the same loader and mods it was created with — otherwise you get missing-dimension and datapack errors like the ones in [this crash guide](/knowledge-base/minecraft-failed-to-load-datapacks-missing-dimensions).

## Find your saves folder

- **Windows**: press Win+R and run \`%appdata%\\.minecraft\\saves\` (expands to \`C:\\Users\\<you>\\AppData\\Roaming\\.minecraft\\saves\`)
- **macOS**: \`~/Library/Application Support/minecraft/saves\`
- **Linux**: \`~/.minecraft/saves\`

Modded launchers keep per-instance folders instead (for the CurseForge app: \`Documents\\curseforge\\minecraft\\Instances\\<pack>\\saves\`).

Inside your world folder you'll see \`level.dat\` (seed, gamerules, world metadata), \`region/\` (overworld terrain), \`DIM-1/\` (nether), \`DIM1/\` (end), \`playerdata/\`, and possibly \`datapacks/\`. All of it comes along.

## Step by step

1. **Quit the singleplayer world** so the game releases its lock and finishes writing.
2. **Zip the world folder itself.** Right-click the folder (e.g. \`MyWorld\`) and compress it, so the archive contains \`MyWorld/level.dat\` at the top level. Do not zip the individual files, and do not zip the folder's parent.
3. **Stop the server.** Never swap world files under a running server.
4. **Upload the zip** with your panel's file manager and extract it server-side, or use SFTP (FileZilla or WinSCP). One archive uploads far faster and more reliably than thousands of small region files.
5. **Point the server at the world.** Either rename the extracted folder to \`world\` (replacing or moving the old one), or set \`level-name=MyWorld\` in \`server.properties\`. Pick one; don't do both.
6. **Paper/Spigot only: let it split dimensions.** On first boot, Paper moves the nether and end into \`world_nether/\` and \`world_the_end/\` automatically. Don't create those folders yourself.
7. **Start and verify.** Check the spawn area looks right, \`/seed\` matches your old seed, and gamerules survived (they live in \`level.dat\`, so they will).
8. **Give yourself operator**: run \`op YourName\` from the server console.

## What happens to inventories

Player data is stored per-UUID in \`playerdata/<uuid>.dat\`. On a server with \`online-mode=true\` and the same Microsoft account you used in singleplayer, your UUID matches — inventory, position and ender chest carry over. On an offline-mode server, players get different UUIDs and start fresh; the old \`.dat\` files remain but are keyed to identities nobody has.

## Troubleshooting

- **The server generated a brand-new world.** Either \`level-name\` doesn't match the folder, or your zip nested a folder (\`MyWorld/MyWorld/level.dat\`). Fix the path so \`level.dat\` sits directly inside the folder the server loads.
- **\`Failed to load datapacks\` or missing dimensions on boot.** The world came from a modded or datapacked instance and the server lacks that content — match the loader and mods, or read the crash guide linked above.
- **"World was saved in a newer version" style refusal.** Upgrade the server jar to at least the world's version; there is no supported downgrade.
- **Random missing chunks or corruption after upload.** An SFTP transfer of loose files got interrupted. Re-upload as a single zip and extract server-side.

## Frequently asked

### How do I move a server world back to singleplayer?

Download the world folder into \`saves/\`. From a Paper server, also copy \`world_nether/DIM-1\` and \`world_the_end/DIM1\` back inside the world folder first, so singleplayer finds all three dimensions in one place.

### Does the seed transfer?

Yes — the seed is stored in \`level.dat\` and travels with the world. Verify with \`/seed\` after the first boot.

### My world is several gigabytes and uploads keep failing. Options?

Zip first (region files compress well), upload the single archive over SFTP so interrupted transfers resume, and consider pruning never-revisited terrain with a tool like MCA Selector before the move.

---

On ReFx, the file manager extracts zips server-side and every plan includes SFTP, so a transfer is upload, extract, restart. [Minecraft plans here](/games/minecraft).`,
  },
  {
    slug: "jvm-flags-modded-minecraft-aikars",
    title: "Recommended JVM flags for modded Minecraft: Aikar's flags explained",
    category: "Minecraft",
    body: `Every modded hosting thread has a pasted wall of JVM flags, usually unexplained and often stale. The set that has actually earned its reputation is **Aikar's flags** — G1 garbage-collector tuning that came out of the Paper community and holds up for Forge, NeoForge and Fabric servers too. This guide gives the canonical flags, what each group does, where they go for each loader, and what they cannot fix.

## The flags

For heaps **under 12 GB** (example sized at 10 GB):

\`\`\`
java -Xms10G -Xmx10G -XX:+UseG1GC -XX:+ParallelRefProcEnabled \\
  -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions \\
  -XX:+DisableExplicitGC -XX:+AlwaysPreTouch \\
  -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 \\
  -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 \\
  -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 \\
  -XX:InitiatingHeapOccupancyPercent=15 \\
  -XX:G1MixedGCLiveThresholdPercent=90 \\
  -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 \\
  -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 \\
  -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true \\
  -jar server.jar nogui
\`\`\`

For heaps of **12 GB or more**, change exactly five values:

- \`-XX:G1NewSizePercent=40\`
- \`-XX:G1MaxNewSizePercent=50\`
- \`-XX:G1HeapRegionSize=16M\`
- \`-XX:G1ReservePercent=15\`
- \`-XX:InitiatingHeapOccupancyPercent=20\`

## What the flags actually do

### Heap sizing: -Xms = -Xmx, plus AlwaysPreTouch

Setting the minimum equal to the maximum stops the JVM from growing and shrinking the heap at runtime, and \`-XX:+AlwaysPreTouch\` commits every page up front. Cost: a slower boot. Benefit: no mid-game stalls while the OS hands over memory.

### Young generation: where Minecraft garbage lives

Minecraft allocates enormous volumes of short-lived objects — block positions, packets, chunk scratch data. \`G1NewSizePercent=30\` / \`G1MaxNewSizePercent=40\` keep the young generation large so that garbage dies there cheaply, and \`MaxTenuringThreshold=1\` with \`SurvivorRatio=32\` stops the JVM from pointlessly copying short-lived objects between survivor spaces before giving up on them.

### Pause control

\`MaxGCPauseMillis=200\` targets pauses of four ticks or less. \`InitiatingHeapOccupancyPercent=15\` starts concurrent marking early, and \`G1MixedGCCountTarget=4\` spreads old-generation cleanup across fewer, predictable mixed collections — the goal is never reaching a multi-second full GC.

### Housekeeping

\`DisableExplicitGC\` ignores \`System.gc()\` calls from careless mods and plugins. \`PerfDisableSharedMem\` stops the JVM writing performance stats to disk, a known source of micro-stutter. The two \`-D\` properties change nothing at runtime — they are markers so profilers and support staff can see which flag set you run.

## Where the flags go, per loader

- **Vanilla, Paper, Fabric**: on the \`java\` command line in your start script or the panel's startup command.
- **Forge and NeoForge (1.17+)**: in \`user_jvm_args.txt\`, one flag per line, \`#\` for comments — the generated \`run.sh\` / \`run.bat\` passes that file to Java. Memory flags here override anything your panel sets earlier on the command line, because the last \`-Xmx\` wins; that mechanism is the classic "tiny heap on a big plan" bug covered in the [OutOfMemoryError guide](/knowledge-base/minecraft-server-out-of-memory-xmx-guide).
- **ServerPackCreator packs** (the All the Mods server files and similar): in \`variables.txt\`, inside the \`JAVA_ARGS\` value.
- **On ReFx**: \`-Xms\`/\`-Xmx\` are derived from your plan automatically, so paste only the tuning flags and leave the memory pair out.

## Pair the flags with the right Java

- 1.16.5 and older: Java 8 (some setups run 11)
- 1.17.x: Java 16 or newer
- 1.18 through 1.20.4: **Java 17**
- 1.20.5 and newer, including all 1.21.x: **Java 21**

Aikar's flags are plain G1 options and are valid on all of these. On Java 21 with very large heaps (16 GB+), generational ZGC (\`-XX:+UseZGC -XX:+ZGenerational\`, replacing all the G1 flags) is a credible alternative that trades a little throughput for near-zero pauses — worth testing only if you can measure the difference.

## What flags will not fix

- **An undersized heap.** No collector tunes its way out of a modpack that needs 10 GB living in 4 GB — size the plan first using our [RAM guide](/knowledge-base/minecraft-server-ram-requirements).
- **CPU-bound TPS.** Entity pileups and worldgen are tick-time problems; profile with spark and pre-generate chunks.
- **A leaking mod.** Flags delay the symptom; the fix is updating or removing the leaker.

## Frequently asked

### Do Aikar's flags still matter on Java 17/21?

The gap has narrowed as G1's defaults improved, but the set remains a well-tested baseline that never hurts. The flags with the most surviving value are the young-generation sizing and \`AlwaysPreTouch\`.

### Should I keep the flags my modpack shipped?

Replace the memory lines with values sized to your server, always. For the rest: pack-shipped flags are frequently stale copies tuned on the author's desktop; Aikar's set is the safer default.

### What about GraalVM and "secret 2x TPS" flag dumps?

Results rarely replicate outside the original poster's machine, and some dumps disable safety mechanisms outright. Don't run flags you can't explain.

---

Prefer not to maintain flags at all? [ReFx sizes the heap from your plan automatically](/games/minecraft).`,
  },
];
