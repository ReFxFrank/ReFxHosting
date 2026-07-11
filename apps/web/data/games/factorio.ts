import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "factorio",
  tagline: "Factorio server hosting measured in UPS — per-core speed and dedicated RAM for the base you are planning, not the one you have.",
  heroCopy:
    "Factorio multiplayer is deterministic lockstep: every participant simulates the same tick, and the server's job is holding 60 UPS as the factory grows. The update loop is effectively single-threaded, which makes per-core performance and memory latency the numbers that matter — ReFx pairs dedicated RAM with burst CPU so a biter wave or a train-saturated megabase does not drag the map below 60. The headless build is official and lean: your save, server-settings.json, and the mods folder are the entire server.",
  whyDedicated: [
    "A 24/7 headless server means the map is always joinable for whoever's shift it is, and auto_pause decides whether evolution advances while nobody is on.",
    "Neutral hosting removes the host advantage — every engineer plays with symmetric latency instead of one player at zero ping.",
    "Headless means no GPU, no window, no host alt-tabbing into a crash mid-rocket — and crash auto-restart if the process ever does die.",
    "Server-side autosaves rotate on your interval, and panel backups snapshot the saves directory before risky map surgery.",
  ],
  recommendedSpecs: [
    {
      players: "2–8 engineers, early factory",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "5 GB SSD",
      note: "Through the first rockets.",
    },
    {
      players: "8–16 engineers",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "5 GB SSD",
      note: "Recommended — mid-game bases and a few hundred hours of map.",
    },
    {
      players: "Megabase ambitions",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "10 GB SSD",
      note: "Where per-core clocks and memory bandwidth dominate.",
    },
  ],
  setupSteps: [
    "Order Factorio at /order — the template runs the official headless build from the stable channel, no Steam account involved.",
    "Provisioning creates saves/<your-save-name>.zip on first boot and renders your server name, description, and player cap into data/server-settings.json.",
    "Edit data/server-settings.json in the file manager for visibility, game password, autosave_interval, and auto_pause behavior.",
    "Promote yourself from the panel console with /promote <name> — the console is the server's stdin, so every slash command works there.",
    "Connect in game via Multiplayer, Connect to address, your-address:34197.",
    "To continue an existing map, upload its .zip into saves/ and set the save name variable to match.",
  ],
  modSupport:
    "Factorio's mod story is disciplined: mods are .zip files in mods/ with mod-list.json flagging which are enabled, all versioned against the game release. Download from the official portal at mods.factorio.com and upload over SFTP, or manage mod-list.json directly in the file manager; clients joining a modded server are prompted to sync the exact mod set before entering. Space Age note — the expansion ships as official mods (space-age, quality, elevated-rails) included with the build: enable them in mod-list.json and every joining player needs to own the expansion.",
  faq: [
    {
      q: "What port does Factorio use?",
      a: "34197/UDP by default, passed via --port on the launch command. It is the only port the game needs; your server's assigned value is on the panel overview.",
    },
    {
      q: "What actually determines my UPS?",
      a: "Entity count and per-core speed. The game update is largely single-threaded, so more cores do not rescue a struggling megabase — belt count, bot swarms, biter pathfinding, and train networks set the load, and clock speed plus memory latency set the ceiling. Vanilla rocket bases run modestly; sprawling megabases are why the top tier exists.",
    },
    {
      q: "How do saves and autosaves work?",
      a: "The live map is saves/<name>.zip, with rotating _autosave files written on the interval from server-settings.json. Download any of them from the file manager, or promote an autosave to the main save by renaming it and pointing the save name variable at it.",
    },
    {
      q: "How do I make someone an admin?",
      a: "Run /promote <name> from the panel console, or maintain server-adminlist.json next to the settings file. Admins get /kick, /ban, /config, and the rest of the moderation command set in game.",
    },
    {
      q: "Does the factory run while nobody is online?",
      a: "By default no — auto_pause in server-settings.json pauses the simulation when the last player disconnects, freezing pollution and evolution too. Set it to false if you want the world to keep ticking around the clock.",
    },
    {
      q: "Do client and server versions need to match?",
      a: "Yes, exactly. The template tracks the stable channel, so players should stay on stable in Steam's beta settings; anyone on the experimental branch will fail to join until the server catches up.",
    },
  ],
  relatedGames: ["satisfactory", "astroneer", "minecraft"],
  searchTerms: [
    "factorio server hosting",
    "factorio dedicated server",
    "factorio headless server",
    "rent factorio server",
    "factorio multiplayer server",
  ],
};

export default content;
