import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "valheim",
  tagline: "Valheim dedicated servers with crossplay on and your world files a download away",
  heroCopy:
    "A Valheim world is two small files — a .fwl with the seed and metadata, a .db with every terraformed hill and longhouse — and good hosting treats them with respect: easy to upload, easy to back up, easy to take with you. ReFx starts your server with the -crossplay flag already in the launch line, so Steam, Xbox, and PC Game Pass vikings share one world from day one. Seeds are permanent at world creation, so if your group wants a mountain next to spawn, roll the seed before you sail — or upload the world you have already explored.",
  whyDedicated: [
    "A hosted co-op world sleeps when the host does — sailing plans die to time zones. A dedicated server keeps the world up so the early-shift and late-shift halves of your group both make progress.",
    "Death runs are miserable when the world is offline: with an always-on server, your corpse and its gear wait exactly where the troll left them.",
    "Valheim leans hard on single-core speed and climbs in memory as players terraform and build; a fixed allocation with strong per-core performance handles plains bases better than a laptop running the game and the server at once.",
    "World files are irreplaceable after a few hundred hours — scheduled backups (plus the offsite Express add-on) protect the .db file that holds every build your group has raised.",
  ],
  recommendedSpecs: [
    {
      players: "2–4 vikings",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "6 GB SSD",
      note: "Fine for a fresh world and a small crew",
    },
    {
      players: "5–10 vikings",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "8 GB SSD",
      note: "The template recommendation — handles built-up worlds comfortably",
    },
    {
      players: "10 players, heavy builds or mods",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "12 GB SSD",
      note: "For megabase worlds and modded servers",
    },
  ],
  setupSteps: [
    "Order a Valheim server at /order and complete checkout — SteamCMD installs the dedicated server (app 896660) on its own as soon as payment goes through.",
    "Set your server name, world name, and password as panel variables; Valheim requires a password of at least five characters that is not contained in the server name, and the world generates from the world name on first boot.",
    "Start the server and follow the live console until it reports the game server connected — first-time world generation takes a minute or two.",
    "Join from Valheim: use the in-game server browser (Join Game) or 'Join IP' with your panel address — the default game port is 2456 (UDP), and the Steam server browser sees the server on 2457 (game port plus one).",
    "Upload an existing world instead, if you have one: stop the server, place the .fwl and .db pair into worlds_local/ via the file manager, set the world name variable to match, and start again.",
    "Turn on a backup schedule for worlds_local/ and add trusted friends as panel sub-users so someone can restart the server while you are in a swamp crypt.",
  ],
  modSupport:
    "Valheim modding runs through BepInEx: install the framework and drop plugin DLLs into BepInEx/plugins over SFTP. Server-only mods (world management, permissions, backups-adjacent tooling) work with vanilla clients, but gameplay mods — Valheim Plus, epic loot tables, new creatures — must be installed on the server and every client at matching versions, or players get desynced or rejected. Keep your mod set deliberately small and pinned: Irongate patches (Ashlands-era updates and beyond) routinely break BepInEx plugins for a few days, so back up before every game update and let mods catch up before you patch a modded server.",
  faq: [
    {
      q: "What port does Valheim use?",
      a: "The game listens on UDP 2456 by default and uses the next port up (2457) for Steam queries — which is why the Steam server browser shows your server at game port plus one, while 'Join IP' in-game takes the game port itself. Your exact address:port is on the panel overview.",
    },
    {
      q: "How do I move my existing world to the server?",
      a: "Copy the world's .fwl and .db files from your PC — on Windows they live at C:\\Users\\<you>\\AppData\\LocalLow\\IronGate\\Valheim\\worlds_local — upload both into the server's worlds_local/ folder, and set the world name variable to the file name (without extension). Characters are separate from worlds in Valheim, so everyone keeps their skills and gear automatically.",
    },
    {
      q: "Does crossplay actually work?",
      a: "Yes — the template's startup line includes -crossplay, which switches networking to the PlayFab backend so Xbox and PC Game Pass players can join Steam players on one server. The trade-off is real: PlayFab routing can add latency compared to direct Steam networking, so if your whole group is on Steam you can ask us to drop the flag for the direct path.",
    },
    {
      q: "Can I change the world seed later?",
      a: "Not for an existing world — the seed is baked into the .fwl at creation and determines terrain that is already saved in the .db. To reroll, set a new world name (which generates a fresh world with a new seed) or generate a world locally from a chosen seed and upload its file pair. Keep the old files in a backup; you can swap between worlds by changing the world name variable.",
    },
    {
      q: "Do game updates wipe anything?",
      a: "No — Valheim has no wipe mechanic, and world files carry across every update; biome reworks like Ashlands only regenerate areas no player has explored yet. The only real update risk is on modded servers, where a patch can break BepInEx plugins — take a manual backup before major updates regardless.",
    },
    {
      q: "Why does my server not appear in the in-game list?",
      a: "The public listing depends on the 'publicly listed' variable being on and the query port responding; freshly started servers can take a few minutes to register. 'Join IP' with address:2456-style port always works regardless of listing — and note the game filters out servers whose version does not match your client, so update mismatches look like a missing server.",
    },
  ],
  relatedGames: ["enshrouded", "palworld", "v-rising", "core-keeper"],
  searchTerms: [
    "valheim server hosting",
    "valheim dedicated server hosting",
    "valheim crossplay server",
    "valheim server rental",
  ],
};

export default content;
