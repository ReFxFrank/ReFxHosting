import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "killing-floor-2",
  tagline: "Wave co-op Zed slaying with Tripwire's built-in web admin, hosted properly.",
  heroCopy:
    "Killing Floor 2 is six-player wave co-op at heart, and its server tooling reflects a game built for standing groups: Tripwire ships a full web admin interface — enable it in KFWeb.ini and you manage difficulty, map changes, kicks, and pauses from a browser tab with no game client open. Difficulty (Normal through Hell on Earth) and match length (4, 7, or 10 waves) ride the travel string, so different rulesets are one URL apart. The template boots KF-BioticsLab on Survival with your admin password already set.",
  whyDedicated: [
    "Wave spikes — Fleshpound packs, boss phases — hammer the CPU in bursts; burst CPU capacity absorbs them without rubber-banding.",
    "The web admin is only useful on an always-reachable host; paired with the ReFx live console you get two ways into a misbehaving server.",
    "A standing group wants the same slots, difficulty, and map order every session — your server keeps them fixed instead of re-rolled per lobby.",
    "Crash auto-restart plus scheduled restarts keep a public server cycling maps around the clock.",
  ],
  recommendedSpecs: [
    {
      players: "Standard co-op (6 players)",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
    },
    {
      players: "6 players with custom maps",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
      note: "The template recommendation.",
    },
    {
      players: "Oversized lobbies (up to 12)",
      ram: "4 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "Zed counts scale with players, and so does CPU load.",
    },
  ],
  setupSteps: [
    "Order a Killing Floor 2 server at /order; it provisions automatically and SteamCMD installs app 232130.",
    "Set the starting map, slot count, and admin password variables — the password protects both web admin and in-game admin.",
    "Enable the web admin in KFGame/Config/KFWeb.ini (bEnabled=True); it serves on its configured listen port, 8080 by default.",
    "Set the map cycle, difficulty, and game length in KFGame/Config/LinuxServer-KFGame.ini via the file manager.",
    "Connect from the server browser or the console with open your-address:7777 — KF2's default game port.",
  ],
  modSupport:
    "KF2 pulls Steam Workshop maps and mods server-side: add workshop IDs to the ServerSubscribedWorkshopItems list in KFEngine.ini, let the server download them, then add the maps to your cycle. Note that heavily modified game modes flip a server to unranked, which pauses official perk progression — decide that before you build around a mutator.",
  faq: [
    {
      q: "What ports does a KF2 server use?",
      a: "Game traffic on UDP 7777 by default, Steam query on 27015, and the web admin on its own HTTP port (8080 in KFWeb.ini). Your assigned game port is shown in the panel.",
    },
    {
      q: "How do I turn on the web admin?",
      a: "Edit KFGame/Config/KFWeb.ini, set bEnabled=True, and restart. Browse to the web admin port and log in as admin with the password you set in the panel — from there you can change maps, difficulty, and kick players live.",
    },
    {
      q: "How do I set difficulty and length?",
      a: "GameDifficulty (0 Normal, 1 Hard, 2 Suicidal, 3 Hell on Earth) and GameLength (0 = 4 waves, 1 = 7, 2 = 10) live in LinuxServer-KFGame.ini, or change them per-map from the web admin.",
    },
    {
      q: "Can I run workshop maps?",
      a: "Yes — list workshop IDs under ServerSubscribedWorkshopItems in KFEngine.ini; the server downloads them itself. Add each map to GameMapCycles so it enters rotation.",
    },
    {
      q: "Can I run more than 6 players?",
      a: "The template allows up to 12 slots. KF2 balances around 6 — Zed counts and health scale beyond that and the game plays differently — but oversized servers are a popular niche.",
    },
    {
      q: "Do players keep their perk progression?",
      a: "Yes on a standard dedicated server — perk XP accrues normally. Running certain mutators or custom game modes marks the server unranked and pauses official progression until reverted.",
    },
  ],
  relatedGames: ["insurgency-sandstorm", "team-fortress-2", "seven-days-to-die", "unturned"],
  searchTerms: [
    "killing floor 2 server hosting",
    "kf2 server hosting",
    "kf2 dedicated server",
    "killing floor 2 web admin",
  ],
};

export default content;
