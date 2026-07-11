import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "mordhau",
  tagline: "Duel yards and 64-player Frontline — Mordhau servers tuned through Game.ini.",
  heroCopy:
    "Mordhau's community splits into two server cultures: duel servers, where flourish-to-initiate etiquette makes the mode a social space as much as a fight, and Frontline or Invasion servers pushing objectives at 48 to 64 players. Both run the same binary — the difference is the map prefix in your rotation (SKM_ skirmish maps for duel rules, FL_ Frontline, INV_ Invasion, HRD_ Horde) and the ruleset in Game.ini. Melee netcode is unforgiving of server hitching, so consistent CPU time matters more here than in most shooters.",
  whyDedicated: [
    "Chambers and drag timing collapse into guesswork when the server hitches; dedicated RAM and burst CPU keep swing timing readable.",
    "Duel communities live on regulars — a stable address with crash auto-restart keeps the yard open every evening.",
    "Mordhau needs three ports (game, query, and matchmaking beacon); the template pre-wires all of them so listing works without router surgery.",
    "Game.ini is the whole ruleset — the panel file manager edits it in the browser, and a one-click backup guards against a bad config push.",
  ],
  recommendedSpecs: [
    {
      players: "Duel yard (16-24 slots)",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "15 GB SSD",
    },
    {
      players: "Frontline (48 slots)",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "15 GB SSD",
      note: "The template default and recommendation.",
    },
    {
      players: "Invasion 64+ with mods",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
    },
  ],
  setupSteps: [
    "Order a Mordhau server at /order; it provisions automatically and SteamCMD installs app 629800.",
    "Your slot count is seeded into Mordhau/Saved/Config/LinuxServer/Game.ini (MaxSlots under the MordhauGameSession section).",
    "Set ServerName, passwords, and Admins= entries (one SteamID64 per line) in the same Game.ini through the file manager.",
    "Build the rotation with MapRotation= lines — SKM_ maps for duel rules, FL_ for Frontline, INV_ for Invasion.",
    "Find the server in the in-game browser; game traffic defaults to UDP 7777, with query on 27015 and the beacon on 15000.",
  ],
  modSupport:
    "Mordhau mods are distributed through mod.io: list mod IDs in Game.ini under the game session section and clients download them on join. Most communities run a small set — admin and RCON-style tools, duel utilities, and map packs are the staples.",
  faq: [
    {
      q: "What ports does a Mordhau server use?",
      a: "Three by default: UDP 7777 for game traffic, 27015 for Steam queries, and 15000 for the matchmaking beacon. All are pre-configured by the template and shown in the panel.",
    },
    {
      q: "How do I make a duel server?",
      a: "Run SKM_ skirmish maps with a generous slot count and publish house rules — flourish to initiate, no interrupting fights. The duel scene is convention-driven, so the server name and rules text do real work.",
    },
    {
      q: "How do I add admins?",
      a: "Add Admins= lines with SteamID64s under the MordhauGameSession section of Game.ini, then use adminlogin in the console to open the in-game admin panel for kicks, bans, and map changes.",
    },
    {
      q: "How does map rotation work?",
      a: "MapRotation= lines in Game.ini, one per map, using the mode prefix (FL_, INV_, SKM_, HRD_). The server advances through the list; restart to apply changes.",
    },
    {
      q: "Can I run mods?",
      a: "Yes — Mordhau uses mod.io. Add the mod IDs to Game.ini and joining clients fetch them automatically; no manual downloads on the player side.",
    },
    {
      q: "How many slots should I run?",
      a: "48 is the template default and comfortable for Frontline; the template allows up to 80. Past 64 the fights get chaotic and RAM use climbs, so scale the plan with the headcount.",
    },
  ],
  relatedGames: ["squad", "insurgency-sandstorm", "cs2"],
  searchTerms: [
    "mordhau server hosting",
    "mordhau dedicated server",
    "mordhau duel server hosting",
    "mordhau frontline server",
  ],
};

export default content;
