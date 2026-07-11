import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "garrys-mod",
  tagline: "DarkRP, TTT, sandbox — GMod servers with workshop collections handled from the panel.",
  heroCopy:
    "A Garry's Mod server is defined by its gamemode: sandbox for building, DarkRP for roleplay economies, TTT for social deduction — one +gamemode flag and a curated Steam Workshop collection are most of a server's identity. A decade ago that meant maintaining a separate FastDL webserver so joining players could download your content; host_workshop_collection replaced all of that, and curation is now the real work. srcds remains effectively single-threaded, so addon discipline and per-core speed matter more than raw slot count.",
  whyDedicated: [
    "A listen server dies the moment the host quits; DarkRP economies and TTT communities need a process that stays up around the clock, with crash auto-restart when a Lua error takes it down.",
    "Large workshop collections cost real memory at boot — dedicated RAM keeps a 200-addon DarkRP server out of swap.",
    "Sub-users with granular permissions let trusted staff restart the server or edit configs without touching your billing.",
    "Scheduled restarts clear srcds memory bloat, a long-standing GMod habit — set them once in the panel and forget them.",
  ],
  recommendedSpecs: [
    {
      players: "Sandbox with friends (8-16)",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
    },
    {
      players: "TTT or DarkRP community (16-32)",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "30 GB SSD",
      note: "The template recommendation.",
    },
    {
      players: "Heavy DarkRP (32+ slots, large collection)",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "50 GB SSD",
      note: "Workshop content and map packs add up fast.",
    },
  ],
  setupSteps: [
    "Order a Garry's Mod server at /order; it provisions automatically after payment and SteamCMD installs srcds (app 4020).",
    "Set the gamemode (sandbox, darkrp, terrortown), starting map, and player slot variables in the panel.",
    "Create a Steam Workshop collection with your addons and put its ID in the Workshop Collection variable — clients download the same content when they join.",
    "Edit garrysmod/cfg/server.cfg in the file manager for hostname, rcon_password, and gamemode cvars.",
    "Optionally add a GSLT for app 4020 so the server keeps a persistent Steam identity for public listing.",
    "Connect via the server browser or console: connect your-address:27015.",
  ],
  modSupport:
    "Workshop is native here: one-click installs from the ReFx panel (workshop app 4000), plus host_workshop_collection for client-side content sync. Gamemodes like DarkRP install into garrysmod/gamemodes, and ULX or SAM admin suites into garrysmod/addons — all reachable over SFTP or the file manager. Legacy FastDL (sv_downloadurl) still works for non-workshop content, but a collection makes it unnecessary for most servers.",
  faq: [
    {
      q: "What port does a GMod server use?",
      a: "srcds uses UDP 27015 by default; your server's exact address and port are shown in the panel.",
    },
    {
      q: "How do I run DarkRP?",
      a: "Set the gamemode variable to darkrp, install the DarkRP gamemode into garrysmod/gamemodes (plus darkrpmodification in garrysmod/addons for configuration), and restart. Jobs, entities, and economy settings live under darkrpmodification/lua/darkrp_config.",
    },
    {
      q: "How do I run TTT?",
      a: "Set the gamemode variable to terrortown and load a ttt_ map. Trouble in Terrorist Town ships with the base game, so no extra install is required.",
    },
    {
      q: "Do players have to download my addons manually?",
      a: "No. Put everything in one Steam Workshop collection and set its ID in the panel; clients pull the collection automatically on connect. FastDL is only needed for legacy non-workshop content.",
    },
    {
      q: "Do I need a GSLT?",
      a: "GMod runs without one, but a Game Server Login Token for app 4020 gives the server a persistent Steam identity and is the sensible default for public communities.",
    },
    {
      q: "How do I set up admins?",
      a: "Install an admin suite such as ULX or SAM from the workshop, then rank yourself in-game; server-side you always have rcon_password from server.cfg and the panel's live console.",
    },
    {
      q: "Can I change gamemodes without wiping the server?",
      a: "Yes — change the gamemode variable and restart. Files stay in place, and a one-click backup before big changes gives you a clean rollback point.",
    },
  ],
  relatedGames: ["team-fortress-2", "cs2", "unturned", "minecraft"],
  searchTerms: [
    "garrys mod server hosting",
    "gmod server hosting",
    "darkrp server hosting",
    "ttt server hosting",
    "gmod dedicated server",
  ],
};

export default content;
