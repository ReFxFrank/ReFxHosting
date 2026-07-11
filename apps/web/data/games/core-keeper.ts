import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "core-keeper",
  tagline: "Core Keeper server hosting — one long-running dig site, ten world slots, and the Game ID always in view.",
  heroCopy:
    "Core Keeper separates worlds from characters: the server holds the world file while every player brings their own character, which makes one long-running server world the group's shared dig site. Seasonal events switch on by the real-world calendar, so an always-on world catches every event window instead of depending on someone hosting that week. The dedicated server prints a Game ID on every boot — ReFx tails CoreKeeperServerLog.txt into the panel console, so that ID is one glance away.",
  whyDedicated: [
    "Characters are client-side but the world is a single server-side file — everyone keeps their gear while the base, the Core, and cleared biomes persist for the whole group.",
    "Date-driven seasonal events only land if a world is actually online when the calendar turns; a 24/7 server catches all of them.",
    "Ten world slots (0–9) let you rotate normal, hard, and creative worlds on the same server without anyone touching their install.",
    "The headless Unity server is lightweight, and a hosted instance beats tunneling friends through a residential connection.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 explorers",
      ram: "3 GB",
      cpu: "1 vCPU",
      storage: "5 GB SSD",
      note: "Starter cavern co-op.",
    },
    {
      players: "4–10 explorers",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "5 GB SSD",
      note: "Recommended for the default 10-slot world.",
    },
    {
      players: "10+ explorers",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "Large community digs with a raised player cap.",
    },
  ],
  setupSteps: [
    "Order Core Keeper at /order — it is one of the lightest servers in the catalog, so the small tier is a legitimate starting point.",
    "After payment the panel installs the headless Linux server and boots your world with the slot, seed, and mode you set as variables (0 normal, 1 hard, 2 creative).",
    "Read the Game ID from the live console — ReFx tails CoreKeeperServerLog.txt, and the ID reprints on every boot.",
    "Friends join through Join Game with the Game ID; the server also binds its assigned port (default 27015) for game traffic.",
    "Rotate worlds by changing the world slot (0–9), and pin the seed variable when you want to reproduce a layout for a fresh run.",
    "Schedule backups — world files are small, so a deep history costs almost nothing.",
  ],
  modSupport: null,
  faq: [
    {
      q: "How do players join a Core Keeper server?",
      a: "With the Game ID the server prints at startup — it is visible in your panel console because ReFx streams the server log there. Share the ID and players use Join Game from the main menu; the -port flag (default 27015) is what the server binds for traffic.",
    },
    {
      q: "Do seasonal events work on a dedicated server?",
      a: "Yes. Events activate based on the server's real-world clock, so a world that is online during the event window gets the decorations, drops, and recipes automatically. This is a genuine argument for keeping one world running all year instead of rehosting per session.",
    },
    {
      q: "Can I upload the world we started in co-op?",
      a: "Yes. Local worlds live under AppData/LocalLow/Pugstorm/Core Keeper on the hosting player's PC; the dedicated server keeps its worlds under .config/unity3d/Pugstorm/Core Keeper/DedicatedServer in your server files. Copy the world file across via SFTP and set the world slot to match.",
    },
    {
      q: "What are the world modes?",
      a: "The template exposes normal (0), hard (1), and creative (2) through the world mode variable. Mode is fixed when a world is created, so to change it, start a new world in a different slot.",
    },
    {
      q: "How many players fit on one world?",
      a: "The template defaults to 10 and accepts up to 100. Core Keeper stays playable well past ten in practice — scale RAM if your community digs out huge bases with heavy automation.",
    },
    {
      q: "Do worlds wipe or decay?",
      a: "No. Nothing expires and there is no forced wipe cadence — a Core Keeper world is permanent until you decide otherwise, which is why slot rotation plus backups is the whole lifecycle story.",
    },
    {
      q: "Can the console versions of Core Keeper join?",
      a: "No. A ReFx server runs the PC dedicated build, and the console editions do not join PC-hosted worlds.",
    },
  ],
  relatedGames: ["terraria", "minecraft", "valheim", "palworld"],
  searchTerms: [
    "core keeper server hosting",
    "core keeper dedicated server",
    "core keeper game id server",
    "rent core keeper server",
  ],
};

export default content;
