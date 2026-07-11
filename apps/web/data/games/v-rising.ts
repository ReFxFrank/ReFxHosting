import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "v-rising",
  tagline: "V Rising server hosting with raid windows, castle decay, and both settings JSONs in your hands.",
  heroCopy:
    "A V Rising server is defined by two JSON files: ServerHostSettings.json for identity and ports, ServerGameSettings.json for the rules — raid windows, teleport binding, loot multipliers, castle limits. Castle hearts burn blood essence in real time, so an always-on world is part of the game design: on a dedicated server the heart keeps consuming (and decaying if you let it run dry) instead of pausing whenever a host closes the game. Time-restricted PvP only works when the server is up to enforce it — set your raid windows once and they fire on schedule.",
  whyDedicated: [
    "Castle decay is a real-time mechanic; peer-hosted worlds pause offline, which quietly breaks the essence economy a 24/7 server plays as designed.",
    "VSCastleWeekdayTime and VSCastleWeekendTime raid windows need an always-on clock — a dedicated server is that clock.",
    "Clan-versus-clan fights spike hard; dedicated RAM with burst CPU absorbs a 40-player siege without the tick rate folding.",
    "One canonical save under save-data makes rollbacks after a griefed weekend and clean seasonal wipes simple file operations.",
  ],
  recommendedSpecs: [
    {
      players: "1–10 vampires",
      ram: "3 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "A PvE clan server with default castle limits.",
    },
    {
      players: "10–40 players",
      ram: "4 GB",
      cpu: "4 vCPU",
      storage: "10 GB SSD",
      note: "Recommended baseline for a PvP server.",
    },
    {
      players: "40+ players",
      ram: "8 GB",
      cpu: "6 vCPU",
      storage: "20 GB SSD",
      note: "High-population PvP with raised castle and clan caps.",
    },
  ],
  setupSteps: [
    "Order V Rising at /order and choose your region — raid-window PvP punishes latency, so keep the server close to your players.",
    "Provisioning is automatic; the panel launches VRisingServer with your server name, save name, and player cap already wired into the launch flags.",
    "Edit save-data/Settings/ServerGameSettings.json in the file manager: GameModeType, CastleDamageMode, raid time windows, and rates (ports are already handled by the flags).",
    "Add your SteamID64, one per line, to save-data/Settings/adminlist.txt; in game, enable the console in options, open it, and run adminauth.",
    "Restart and connect via the in-game server list or direct connect to your-address:9876 (query 9877).",
    "Schedule nightly backups; for a wipe, change the Save Name variable — a fresh world starts while the old save stays on disk.",
  ],
  modSupport:
    "V Rising has no official modding or Workshop pipeline. Community server-side frameworks exist (BepInEx-based) but break on major patches and are unsupported by the developer, so treat them as disposable and keep vanilla backups you can roll back to. In practice, most of what owners want mods for — rates, raid schedules, castle rules, PvE/PvP mode — is native ServerGameSettings.json configuration you can do from the file manager today.",
  faq: [
    {
      q: "What ports does V Rising use?",
      a: "The game port defaults to 9876/UDP and the Steam query port to 9877/UDP. Both are passed on the launch command; your server's assigned address and ports appear on the panel overview.",
    },
    {
      q: "How do I schedule PvP raid windows?",
      a: "In ServerGameSettings.json set CastleDamageMode to TimeRestricted, then define VSCastleWeekdayTime and VSCastleWeekendTime with start and end hours. Windows are evaluated on the server's clock, so keep your community's time zone in mind when picking hours.",
    },
    {
      q: "Will castles decay while we are offline?",
      a: "Castle hearts consume blood essence continuously; when the heart runs dry, the castle enters decay and eventually collapses. Stock more essence for holidays, tune CastleBloodEssenceDrainModifier, or set the decay rate modifier to zero for a decay-free PvE server.",
    },
    {
      q: "Can I move my local co-op save to the server?",
      a: "Yes. Local saves live under AppData/LocalLow/Stunlock Studios/VRising on the host PC. Copy the save folder into the versioned Saves directory under save-data on the server, name it to match your Save Name variable, and restart.",
    },
    {
      q: "How does admin work in game?",
      a: "Players listed in save-data/Settings/adminlist.txt can run adminauth in the console to unlock admin commands — kicks, bans, teleports, and give commands. Keep banlist.txt in the same folder for permanent removals.",
    },
    {
      q: "Do private V Rising servers need wipes?",
      a: "No mechanic forces one — official PvP seasons wipe by policy, not necessity. When your community wants a fresh map, change the Save Name variable and the server generates a new world while retaining the previous one for archival.",
    },
    {
      q: "Is there crossplay with PlayStation?",
      a: "No. The console release runs on separate infrastructure; a ReFx server hosts the PC (Steam) build, and only PC players can join it.",
    },
  ],
  relatedGames: ["valheim", "conan-exiles", "enshrouded", "palworld"],
  searchTerms: [
    "v rising server hosting",
    "v rising dedicated server",
    "rent v rising server",
    "v rising pvp server",
  ],
};

export default content;
