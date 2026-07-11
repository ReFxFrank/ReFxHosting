import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "avorion",
  tagline: "Avorion server hosting for whole-galaxy campaigns — seeded generation, alive sectors, and a console that speaks to the server.",
  heroCopy:
    "An Avorion galaxy is generated from a single seed and then persisted sector by sector as players push toward the barrier — the server only simulates sectors that are alive, and aliveSectorsPerPlayer in server.ini decides how many stay running per player. Load therefore scales with how your crew plays, not just headcount: five captains scattered across the rim keep far more sectors hot than five flying in formation. ReFx runs the native Linux build with the galaxy under a clean datapath, so server.ini, mod configuration, and the per-sector saves all sit in the file manager.",
  whyDedicated: [
    "Galaxies are campaigns measured in weeks; a persistent server keeps factions, stations, and claimed sectors consistent instead of living on one player's PC.",
    "Alive-sector simulation — mines and factories producing while your fleet is elsewhere — only happens while the server is up.",
    "Player and alliance ships persist server-side, so a griefed home sector is a backup restore rather than a restart.",
    "Fleet battles and station-dense sectors are load spikes, and burst CPU absorbs them without flattening the tick.",
  ],
  recommendedSpecs: [
    {
      players: "1–5 captains",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "8 GB SSD",
      note: "A tight fleet exploring together.",
    },
    {
      players: "5–10 captains",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "8 GB SSD",
      note: "Recommended for the default 10-slot galaxy.",
    },
    {
      players: "10+ captains",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "16 GB SSD",
      note: "Spread-out communities keeping many sectors alive.",
    },
  ],
  setupSteps: [
    "Order Avorion at /order — and if your group scatters rather than flying together, size up: alive sector count, not player count, is the real load.",
    "Provisioning installs the native Linux server via SteamCMD; the first boot generates the galaxy under the galaxy/ datapath in your file tree.",
    "Tune server.ini inside the galaxy folder from the file manager — difficulty, collision damage, aliveSectorsPerPlayer, and the seed (fixed once sectors have generated).",
    "Use the panel console for live administration: it feeds the server's command line, so /save, /players, and /stop work without joining the game.",
    "Connect in game via Multiplayer, Join via IP, your-address:27000 (query on 27003).",
    "Schedule regular backups — the galaxy folder is the entire universe state, saved sector by sector.",
  ],
  modSupport:
    "Avorion loads Steam Workshop mods natively on dedicated servers: list Workshop IDs in the galaxy's modconfig.lua (editable from the file manager) and the server downloads and activates them at startup. Pure server-side mods need nothing from players, while gameplay mods are declared to clients, which fetch them from the Workshop when joining. Restart after changing the list, and watch the console — mod load order and script errors print there.",
  faq: [
    {
      q: "What ports does Avorion use?",
      a: "The game port defaults to 27000 (TCP and UDP) with the query port on 27003; the template also wires the Steam master and Steam query ports (27021 and 27020). Your assigned values are visible on the panel overview.",
    },
    {
      q: "Can I choose my galaxy seed?",
      a: "Yes, at creation time — the seed lives in server.ini and deterministically drives all sector generation. Once sectors have been generated and saved, changing the seed does nothing for explored space, so a new seed effectively means starting a fresh galaxy (back the old one up first).",
    },
    {
      q: "Can I move my single-player galaxy onto the server?",
      a: "Yes. Local galaxies live under AppData/Roaming/Avorion/galaxies on your PC. Stop the server, upload your galaxy folder into the server's datapath as galaxy/Avorion (the name the template launches), and start it up — ships, factions, and explored sectors carry over.",
    },
    {
      q: "What makes an Avorion server slow, and how do I fix it?",
      a: "Alive sector count is the main lever: every simulated sector costs CPU and memory whether or not a player is in it. Lower aliveSectorsPerPlayer in server.ini for a tighter footprint, or move up a tier when your community starts claiming sectors across the map.",
    },
    {
      q: "How do I get admin rights?",
      a: "Grant them by Steam ID from the panel console with /admin -a <SteamID64>. Admins can then use the in-game and console moderation commands; the console also accepts /save and /players directly since it is attached to the server process.",
    },
    {
      q: "Do galaxies wipe?",
      a: "Never automatically — sectors persist indefinitely once generated. Communities that want a fresh start archive the galaxy folder (or just take a backup) and let a new one generate on the next boot.",
    },
  ],
  relatedGames: ["astroneer", "factorio", "satisfactory"],
  searchTerms: [
    "avorion server hosting",
    "avorion dedicated server",
    "rent avorion server",
    "avorion galaxy server",
  ],
};

export default content;
