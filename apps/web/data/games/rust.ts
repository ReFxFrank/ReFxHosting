import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "rust",
  tagline: "Rust server hosting with wipe control, Oxide on a switch, and RCON from the panel",
  heroCopy:
    "Running Rust means running a wipe schedule: Facepunch force-wipes every map on the first Thursday of the month when the client update ships, and everything about your server — seed, size, blueprint policy, plugin stack — orbits that clock. ReFx provisions the dedicated server with your world size (3500 default) and seed as panel variables, RCON on 28016 for admin work, and an Oxide/uMod install toggle so going modded is a switch, not a migration. Whether you are building a weekly-wipe PvP server or a monthly low-pop for friends, the wipe workflow is a console command and two file deletions, all doable from the panel.",
  whyDedicated: [
    "Rust has no peer-to-peer option — every playable server is a dedicated server, and the game's CPU appetite (entity ticking across a 3.5k procedural map) demands dedicated cores, not shared ones.",
    "Wipe day is a load spike by design: everyone rejoins at once, fresh map generation hammers the CPU, and burst capacity is the difference between a smooth wipe and a queue of angry regulars.",
    "PvP servers attract DDoS attempts around raid windows and wipe day; network-level protection in front of your address is table stakes for keeping a population.",
    "Plugins, kits, and player data accumulate between wipes — scheduled backups let you carry the parts you want (blueprints, economy data) and drop the parts you do not.",
  ],
  recommendedSpecs: [
    {
      players: "10–25 players",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "25 GB SSD",
      note: "A smaller map (2500–3000) keeps memory in check",
    },
    {
      players: "50 players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "The template recommendation — 3500 map, moderate plugin stack",
    },
    {
      players: "100+ players",
      ram: "16 GB",
      cpu: "6 vCPU",
      storage: "50 GB SSD",
      note: "Large maps (4000+), heavy Oxide stacks, long entity lists",
    },
  ],
  setupSteps: [
    "Order a Rust server at /order and check out; SteamCMD pulls the dedicated server (app 258550) automatically once payment clears — Rust's install is large, so first provisioning takes longer than most games.",
    "Set your identity before first boot: server name, world size (1000–6000, default 3500), and seed are panel variables — the map generates from size plus seed, so lock them in before players build.",
    "Decide vanilla or modded: flip the Oxide install toggle to true and the installer lays down uMod/Oxide, after which plugins drop into oxide/plugins over SFTP.",
    "Boot and watch the live console — first start generates the procedural map, which takes several minutes at 3500. Server commands and settings persist in server/rust/cfg/serverauto.cfg.",
    "Connect in-game: press F1 and run client.connect your.address:port — Rust's default game port is 28015, and your exact address is on the panel overview.",
    "Claim admin by adding your SteamID64 with ownerid in the console, then set your wipe-day routine: a backup schedule before the first Thursday of each month and a restart schedule for daily maintenance.",
  ],
  modSupport:
    "The template ships an Oxide/uMod toggle: enable it and the installer deploys the framework, then plugins (.cs files) go straight into oxide/plugins via SFTP or the file manager and hot-load without a restart. The uMod catalog covers the standard server toolkit — permissions, kits, teleport, clans, stack sizes — and the Carbon framework is the newer alternative that runs most Oxide plugins with lower overhead. Oxide servers stay client-vanilla: players join with the stock Rust client, nothing to install. Custom maps are a separate axis — hosted map files plus levelurl — and worth planning around wipe day since a custom map replaces procedural generation.",
  faq: [
    {
      q: "What ports does a Rust server use?",
      a: "Game traffic defaults to 28015 (UDP) — players connect with client.connect address:28015 from the F1 console — and RCON listens on 28016 for admin tools. Both are set at provisioning; the panel overview shows the exact address:port pair for your server.",
    },
    {
      q: "How do forced wipes work, and do I have a choice?",
      a: "No choice on map wipes: the first Thursday of every month (around 19:00 UTC), Facepunch ships a client update that breaks compatibility, and every server must update and regenerate its map. Blueprint wipes are rarer and only forced when Facepunch says so. Between forced wipes you set your own cadence — many servers wipe maps weekly or biweekly and keep blueprints monthly.",
    },
    {
      q: "How do I wipe my server manually?",
      a: "Stop the server, then delete the map files in server/rust/ — the .map and .sav files — via the file manager, and change SERVER_SEED if you want a genuinely new layout. For a blueprint wipe, also delete the player.blueprints.*.db file. Start the server again and it generates fresh. Take a backup first if you may ever want the old world back.",
    },
    {
      q: "Can I run a custom or RustEdit map?",
      a: "Yes — Rust loads custom maps from a URL via the levelurl convar rather than a local upload, so host the .map file on a public URL and set it in serverauto.cfg. Procedural size and seed are ignored while levelurl is set. Custom maps still obey forced-wipe compatibility, so confirm the map is updated for each monthly patch.",
    },
    {
      q: "Vanilla or Oxide — will plugins get my server delisted?",
      a: "Modded servers are normal in Rust; the community browser has a dedicated Modded tab, and quality-of-life stacks (kits, teleport, shops) are standard there. What matters is honesty: servers that change gather rates or loot while advertising as vanilla lose players fast. The Oxide toggle lets you run either, and switching a low-pop vanilla server to modded later does not lose the world.",
    },
    {
      q: "Can console players join my Rust server?",
      a: "No. Rust on PC and Rust Console Edition are separate games with separate server ecosystems — a PC dedicated server only accepts PC clients (Steam). There is no crossplay bridge.",
    },
    {
      q: "What happens to plugins and player data across wipes?",
      a: "Oxide plugin code and configuration live outside the map files, so a map wipe leaves your plugin stack intact — only the world and (optionally) blueprints reset. Player data stored by plugins (economy balances, kit cooldowns) persists unless you clear each plugin's data files under oxide/data, which is exactly the kind of selective reset scheduled backups make reversible.",
    },
  ],
  relatedGames: ["dayz", "seven-days-to-die", "conan-exiles", "unturned"],
  searchTerms: [
    "rust server hosting",
    "rust dedicated server hosting",
    "rent a rust server",
    "modded rust server hosting",
    "oxide rust server",
  ],
};

export default content;
