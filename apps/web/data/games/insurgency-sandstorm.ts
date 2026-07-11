import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "insurgency-sandstorm",
  tagline: "Checkpoint co-op and hardcore PvP servers with scenario-level control.",
  heroCopy:
    "The flag that defines a Sandstorm server is the scenario: Scenario_<Map>_Checkpoint_Security turns any map into the AI-clearing co-op mode that dominates community hosting, capped at 8 players, while Push and Firefight PvP scale to 32. Mutators layer rule changes on top — Hardcore, Frenzy, Gunslingers — as a comma-separated list, no file surgery required. New World Interactive's dedicated server is simple enough that your time goes into MapCycle.txt and mutator combinations, not infrastructure.",
  whyDedicated: [
    "Matchmade co-op hands you NWI's rules and random teammates; your own server fixes the scenario, the bot behavior, and the roster.",
    "Checkpoint AI counts spike on counterattacks; burst CPU absorbs the wave spawns without the slideshow.",
    "Admins.txt plus a stable address means your ban list and your regulars survive every map change.",
    "Mutator experiments mean frequent restarts — the live console and panel restart controls make iteration quick.",
  ],
  recommendedSpecs: [
    {
      players: "Checkpoint co-op (8 players)",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
    },
    {
      players: "Co-op with mods and heavier bot counts",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
      note: "The template recommendation.",
    },
    {
      players: "PvP (up to 32)",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
    },
  ],
  setupSteps: [
    "Order an Insurgency: Sandstorm server at /order; it provisions automatically and SteamCMD installs app 581330.",
    "Set the map and scenario variables — the default boots Oilfield Push; switch to Scenario_Oilfield_Checkpoint_Security and 8 slots for co-op.",
    "Add SteamID64s to Insurgency/Config/Server/Admins.txt (one per line) for in-game admin access.",
    "Build Insurgency/Config/Server/MapCycle.txt from scenario names to control what rotates after each match.",
    "Players connect through the server browser; game traffic defaults to UDP 27102 with Steam query on 27131.",
  ],
  modSupport:
    "Sandstorm mods come from mod.io rather than the Steam Workshop: list mod IDs in Insurgency/Config/Server/Mods.txt and run the server with mods enabled; joining clients download the active set automatically. Checkpoint AI overhauls, weapon tweaks, and community map ports are the staples.",
  faq: [
    {
      q: "What ports does a Sandstorm server use?",
      a: "UDP 27102 for game traffic and 27131 for Steam queries by default — the query value comes straight from the template, and your assigned ports are shown in the panel.",
    },
    {
      q: "How do I set up checkpoint co-op?",
      a: "Set the scenario variable to a Checkpoint scenario, for example Scenario_Farmhouse_Checkpoint_Security, and cap players at 8 — co-op modes enforce that limit. The Security or Insurgents suffix picks which side you play.",
    },
    {
      q: "How do mutators work?",
      a: "Mutators load through the -Mutators launch argument as a comma-separated list, for example Hardcore,Frenzy. NWI documents the official mutator names; they stack, which is where community servers get their identity.",
    },
    {
      q: "Can I tune the AI in checkpoint?",
      a: "Yes — Game.ini accepts settings like AIDifficulty plus MinimumEnemies and MaximumEnemies under the checkpoint game mode section, which scale bot counts to your group.",
    },
    {
      q: "How do I become admin in-game?",
      a: "Add your SteamID64 to Insurgency/Config/Server/Admins.txt and restart; the in-game admin menu then handles kicks, bans, and map travel.",
    },
    {
      q: "Do players earn XP on my server?",
      a: "Official rank progression only accrues on servers registered with NWI's GameStats system plus a Valve GSLT. Unregistered community servers play normally but do not award official XP.",
    },
    {
      q: "How does map rotation work?",
      a: "List scenarios in Insurgency/Config/Server/MapCycle.txt, one per line; the server advances through the file after each match.",
    },
  ],
  relatedGames: ["squad", "killing-floor-2", "arma3", "cs2"],
  searchTerms: [
    "insurgency sandstorm server hosting",
    "sandstorm dedicated server",
    "insurgency sandstorm checkpoint server",
    "sandstorm co-op server hosting",
  ],
};

export default content;
