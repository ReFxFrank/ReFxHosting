import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "seven-days-to-die",
  tagline: "7 Days to Die hosting tuned around one deadline: the seventh night",
  heroCopy:
    "Everything on a 7 Days to Die server points at blood moon night — the horde that stress-tests your base design and your server's CPU at the same moment, as dozens of pathfinding zombies calculate routes through your killbox simultaneously. The dedicated server reads its whole personality from serverconfig.xml: world seed, blood moon frequency and horde size, day length, land claims, difficulty. ReFx seeds that file from your panel variables at install (name, player cap, difficulty, seed) and gives the server a 3-core recommendation because horde night is a single-scene CPU spike, not an average.",
  whyDedicated: [
    "Horde night on a peer-hosted game stutters exactly when it matters — dedicated burst CPU absorbs the pathfinding spike of a blood moon so deaths are earned, not lagged.",
    "Crafting queues, forges, and dew collectors run on world time; a persistent server means smelting finishes overnight instead of pausing with the host.",
    "A wiped-out team can walk away from a bad horde night — crash auto-restart and a restart schedule make sure the server never does.",
    "Land claim protection only defends offline players' bases if the world stays up to enforce it.",
  ],
  recommendedSpecs: [
    {
      players: "2–4 friends",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "12 GB SSD",
      note: "A private world with default horde sizes",
    },
    {
      players: "6–8 players",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "15 GB SSD",
      note: "The template recommendation — steady through blood moons",
    },
    {
      players: "10+ players or overhaul mods",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "Bigger hordes, larger generated worlds, Darkness Falls-class mods",
    },
  ],
  setupSteps: [
    "Order a 7 Days to Die server at /order and complete checkout — SteamCMD installs the dedicated server (app 294420) automatically once payment lands.",
    "Set the basics as panel variables — server name, max players, difficulty (0–5), and world seed — and the installer writes them into serverconfig.xml before first boot.",
    "Generate your world on first start and watch the live console: random world generation from your seed takes several minutes, and the console shows generation progress explicitly.",
    "Fine-tune serverconfig.xml in the file manager while stopped: BloodMoonFrequency (7 by default), BloodMoonEnemyCount, DayNightLength (60 real minutes per day by default), LandClaimSize, and ServerPassword are the ones most groups touch first.",
    "Connect in-game via Join a Game with your address — the default port is 26900 (TCP and UDP, with the adjacent UDP ports up through 26903 in use) — or find the server by name in the browser.",
    "Claim admin by adding your platform ID to serveradmin.xml (the console prints its location on boot), then set backup and restart schedules — a restart after horde night keeps entity counts clean.",
  ],
  modSupport:
    "7 Days to Die loads mods from a Mods/ folder in the server root, and the crucial distinction is XML versus overhaul: XML modlets (loot tweaks, recipe changes, UI additions) are server-side only — players join with a vanilla client and never know — while full overhauls like Darkness Falls change assets and must be installed identically on the server and every client, usually with EAC disabled in serverconfig.xml. Upload mod folders via SFTP, keep each modlet in its own directory under Mods/, and restart to load. Start with server-side modlets; they deliver most of the customization with none of the client-coordination overhead.",
  faq: [
    {
      q: "What ports does a 7 Days to Die server use?",
      a: "The base port is 26900 (TCP for Steam negotiation, UDP for game traffic), and the server also uses the next few UDP ports up through 26903 for queries and networking. ReFx allocates the block at provisioning; the address on the panel overview is what players enter under Join a Game.",
    },
    {
      q: "Where are saves, and how do I move a world in or out?",
      a: "Inside your server files under .local/share/7DaysToDie/ — Saves/<WorldName>/<GameName>/ holds player data and world state, and GeneratedWorlds/ holds RWG output. To migrate a world, copy both the save folder and its matching generated world folder via SFTP, and set GameWorld and GameName in serverconfig.xml to match. Backups from the panel capture the full tree, which is also your rollback for a horde night gone catastrophically wrong.",
    },
    {
      q: "How do I control horde nights?",
      a: "In serverconfig.xml: BloodMoonFrequency sets the cadence (7 days by default; 0 disables blood moons entirely), BloodMoonRange adds random variance so the date is not guaranteed, and BloodMoonEnemyCount sets simultaneous zombies per player — the single most performance-relevant number on the server. Warn your players before raising it; the server can take more than most bases can.",
    },
    {
      q: "Random world or Navezgane?",
      a: "GameWorld in serverconfig.xml picks between Navezgane (the handcrafted map) and RWG, where WorldGenSeed plus WorldGenSize (default 6144) generate a unique world. RWG generation is a one-time CPU-heavy step on first boot; bigger worlds cost generation time and disk, not ongoing performance. Most multiplayer groups run RWG for the exploration value.",
    },
    {
      q: "Do updates wipe my world?",
      a: "Major versions usually do in practice: the developers recommend a fresh save across big releases (the Alpha-to-1.0 jump and subsequent major versions), because prefabs, loot tables, and progression change underneath. Minor patches within a version carry saves fine. Back up before any update, and treat version day as wipe day for planning purposes — many communities schedule fresh maps around it anyway.",
    },
    {
      q: "Can console players join my server?",
      a: "The current console edition (post-2024) and PC both exist, but dedicated community servers are a PC-ecosystem feature — a PC dedicated server serves PC clients. Crossplay between PC servers and consoles has been on the developers' public roadmap, so verify the current state before promising it to a mixed group.",
    },
  ],
  relatedGames: ["project-zomboid", "rust", "dayz", "valheim"],
  searchTerms: [
    "7 days to die server hosting",
    "7dtd server hosting",
    "7 days to die dedicated server",
    "7 days to die server rental",
  ],
};

export default content;
