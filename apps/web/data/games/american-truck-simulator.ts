import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "american-truck-simulator",
  tagline: "Always-on convoy sessions for American Truck Simulator, up to 8 trucks.",
  heroCopy:
    "An ATS dedicated server hosts a convoy session: up to 8 players share a synchronized world — time of day, weather, traffic — while each driver's money, trucks, and job progress stay in their own local profile, exactly as SCS designed it. The one genuinely unusual setup step is server_packages: you export server_packages.sii and server_packages.dat from your own game client (the export_server_packages console command) so the server knows your map DLC and mod loadout, then upload both files. After that it is a standing lobby that is online whenever your convoy is.",
  whyDedicated: [
    "Client-hosted convoys end when the host quits; a dedicated session survives everyone logging off and is waiting for the next haul.",
    "The lobby keeps a fixed identity — session name, password, and rules like player damage, traffic, and the speed limiter persist in server_config.sii instead of being re-created each night.",
    "The footprint is small, so what you are buying is availability and a stable address, not raw capacity.",
    "The file manager makes the server_packages swap quick whenever your mod set changes.",
  ],
  recommendedSpecs: [
    {
      players: "Weekend convoy (2-4 trucks)",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "The template recommendation — ATS servers are light.",
    },
    {
      players: "Full convoy (8 trucks) with mods",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
    },
  ],
  setupSteps: [
    "Order an American Truck Simulator server at /order; the dedicated server (app 2239530) installs automatically and server_config.sii is seeded from your panel variables.",
    "On your own PC, open the ATS console and run export_server_packages; it writes server_packages.sii and server_packages.dat into your Documents/American Truck Simulator folder.",
    "Upload both server_packages files to the server root with the file manager or SFTP — the server cannot host a session without them.",
    "Review server_config.sii for lobby name, password, player damage, traffic, and speed limiter settings.",
    "Restart from the panel, then join in-game via Multiplayer, Convoy — search for your lobby name in the session browser.",
  ],
  modSupport:
    "Mods work when the server and every player agree: enable your mod set on the client profile you export server_packages from, re-export after any change, and upload the fresh files. Joining players need the same mods and map DLC active, so agree the convoy's loadout before the session, not during it.",
  faq: [
    {
      q: "What are server_packages and why do I need them?",
      a: "They are a snapshot of your map DLC and mod configuration, exported from a real game client with the export_server_packages console command. The dedicated server cannot simulate the world without them, and you must re-export whenever your mods or DLC change.",
    },
    {
      q: "What ports does an ATS server use?",
      a: "The seeded config uses connection port 27015 and query port 27016 by default; your assigned values are written into server_config.sii and shown in the panel. Most players simply join through the in-game Convoy browser.",
    },
    {
      q: "Is my trucking progress saved on the server?",
      a: "No — and that is by design. Convoy synchronizes the session (time, weather, traffic, other trucks) while each player's profile keeps its own money, garages, and jobs locally, so nothing is lost if the session resets.",
    },
    {
      q: "How many players can join?",
      a: "Eight — SCS's convoy cap, which the template enforces. You can set max_players lower in server_config.sii for a private group.",
    },
    {
      q: "Do players need the same DLC and mods?",
      a: "Export server_packages from a profile carrying the DLC and mods you want the session to use. Players whose map DLC or mod set differs may be blocked or restricted, so keep the convoy's loadout agreed in advance.",
    },
    {
      q: "Can I make the convoy private and moderate it?",
      a: "Yes — set the server password variable in the panel (written into server_config.sii), and list trusted players' Steam IDs in the moderator_list entry of the same file.",
    },
  ],
  relatedGames: ["valheim", "minecraft", "project-zomboid"],
  searchTerms: [
    "american truck simulator server hosting",
    "ats dedicated server",
    "ats convoy server hosting",
    "american truck simulator multiplayer server",
  ],
};

export default content;
