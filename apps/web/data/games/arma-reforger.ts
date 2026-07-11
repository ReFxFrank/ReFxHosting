import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "arma-reforger",
  tagline: "Enfusion-engine Reforger servers configured through one JSON file, mods included.",
  heroCopy:
    "Arma Reforger runs from a single JSON config: configs/server.json sets the scenario, the player cap, and the mod list, and the server downloads every listed mod from Bohemia's Workshop on boot. That Workshop is Bohemia's own, not Steam's — which is exactly what lets PC and Xbox players share a modded server. Moving from Conflict on Everon to a Game Master session is a scenarioId edit and a restart, not a reinstall.",
  whyDedicated: [
    "Crossplay communities span platforms and time zones; a dedicated server keeps the Conflict session up while the founding squad is offline.",
    "Enfusion is memory-hungry — the template recommends 8 GB — and dedicated RAM stops mid-firefight paging.",
    "Bohemia patches Reforger frequently and long sessions accumulate memory; crash auto-restart plus a nightly restart schedule is the standard operating setup.",
    "The file manager edits server.json directly in the browser, with SFTP for anything larger.",
  ],
  recommendedSpecs: [
    {
      players: "Co-op group (up to 16)",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "25 GB SSD",
    },
    {
      players: "Conflict server (32 players)",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "Template default slot count and recommendation.",
    },
    {
      players: "Large or heavily modded (64+)",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
    },
  ],
  setupSteps: [
    "Order an Arma Reforger server at /order; it provisions automatically and SteamCMD installs app 1874900.",
    "Open configs/server.json in the file manager — name, password, and player count are seeded from your panel variables.",
    "Set scenarioId: the default {ECC61978EDCC2B5A}Missions/23_Campaign.conf boots Conflict on Everon, and Game Master or workshop scenarios use their own IDs.",
    "Add mods to the mods array by their Workshop modId; the server fetches them on the next start.",
    "Find the server in the in-game browser — game traffic defaults to UDP 2001 — including from Xbox when crossplay is enabled.",
  ],
  modSupport:
    "Reforger mods live on Bohemia's cross-platform Workshop, not Steam. List each mod's GUID in the mods array of configs/server.json and the server downloads it at startup; joining clients fetch the same set automatically, on PC and Xbox alike. Workshop scenarios publish their scenarioId on their Workshop pages, so a modded rotation is still just config.",
  faq: [
    {
      q: "What port does a Reforger server use?",
      a: "UDP 2001 is the default game port, with the A2S query service on its own port (17777 by default) for server-browser listings. Your assigned ports are shown in the panel.",
    },
    {
      q: "Can Xbox players join my server?",
      a: "Yes. With crossPlatform enabled in server.json, Xbox players join PC servers — including modded ones, since Bohemia's Workshop delivers mods to both platforms.",
    },
    {
      q: "How do I install mods?",
      a: "Add entries to the mods array in configs/server.json using each mod's modId (the GUID on its Workshop page). Unpinned mods track the latest release; the server downloads updates at startup.",
    },
    {
      q: "How do I change the scenario?",
      a: "Edit scenarioId in server.json and restart. Vanilla Conflict and Game Master configs ship with the game, and workshop scenarios document their IDs — rotating scenarios week to week is a one-line change.",
    },
    {
      q: "How does admin work?",
      a: "Set adminPassword in server.json and use #login in chat, or list trusted players' identity IDs in the admins array for permanent access.",
    },
    {
      q: "Why schedule restarts?",
      a: "Long Reforger sessions accumulate memory and Bohemia ships frequent updates. A panel restart schedule keeps performance level, and crash auto-restart covers anything a patch breaks mid-session.",
    },
  ],
  relatedGames: ["arma3", "squad", "dayz"],
  searchTerms: [
    "arma reforger server hosting",
    "arma reforger dedicated server",
    "reforger server hosting",
    "arma reforger crossplay server",
  ],
};

export default content;
