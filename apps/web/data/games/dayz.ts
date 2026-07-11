import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "dayz",
  tagline: "DayZ server hosting with one-click Workshop mods and the .RPT log streamed where you can see it.",
  heroCopy:
    "Every serious DayZ server is really a mission folder: types.xml loot economy, event definitions, and spawn tables under mpmissions/dayzOffline.chernarusplus decide whether your Chernarus plays vanilla or like a boosted PvP arena. ReFx installs Bohemia's dedicated server, loads your Workshop mod stack automatically, and streams the .RPT log straight into the panel console — DayZ writes almost nothing to stdout, so on most hosts you run blind. Tune the central economy, add @CF and your admin tools, and restart on a schedule the way established community servers do.",
  whyDedicated: [
    "The central loot economy cycles continuously — a 24/7 server keeps item lifetimes, restocks, and persistence files behaving the way the mission intends.",
    "Community DayZ is mod-heavy, and server-side mod installs need case-correct paths and .bikey handling; the ReFx Workshop integration does the download, Linux path lowercasing, and key copying for you.",
    "Scheduled restarts every few hours are standard DayZ practice; panel schedules chain a backup and a restart without you setting an alarm.",
    "BattlEye RCON stays reachable for kicks and bans even when nobody from the staff team is in game.",
  ],
  recommendedSpecs: [
    {
      players: "1–20 survivors",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "20 GB SSD",
      note: "Vanilla Chernarus with a light mod list.",
    },
    {
      players: "20–60 survivors",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "Recommended — covers a standard community mod stack.",
    },
    {
      players: "60–127 survivors",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
      note: "High-population servers running expansion-scale modpacks.",
    },
  ],
  setupSteps: [
    "Order DayZ at /order and pick the region nearest your player base — melee trades and vehicle physics punish latency.",
    "Provisioning runs automatically after payment: SteamCMD installs the server and serverDZ.cfg is created with your server name, slots, and RCON password.",
    "Add mods on the server's Workshop tab — each item is downloaded, symlinked as @ws_<id>, and its .bikey files are copied into keys/ for you.",
    "Edit the mission under mpmissions/dayzOffline.chernarusplus — types.xml for loot nominal counts and lifetimes, events.xml and cfgeventspawns.xml for heli crashes and infected spawns.",
    "Set restart and backup schedules (every 4–6 hours is the community norm), then connect through the DayZ Launcher or DZSA to your-address:2302.",
  ],
  modSupport:
    "This template has full Steam Workshop integration: search or paste Workshop IDs on the panel's Workshop tab and ReFx downloads each item with the node's Steam account, lowercases folder names for the Linux filesystem, links them into the -mod list, and installs the .bikey keys automatically. Local mods still work too — upload folders over SFTP and add them to the Mod List variable, semicolon-separated (for example @CF;@VPPAdminTools). Clients must run the same mod set, so most communities publish a DZSA or DayZ Launcher preset.",
  faq: [
    {
      q: "What port does DayZ use?",
      a: "The game port defaults to 2302/UDP. The Steam query port is set in serverDZ.cfg (27016 by default in Bohemia's template), and RCON runs through BattlEye using the password you set in the RCON / Admin Password variable.",
    },
    {
      q: "How do I change loot spawns?",
      a: "Loot is governed by mpmissions/dayzOffline.chernarusplus/db/types.xml — nominal is how many of an item the economy targets, min is the floor, lifetime is how long it persists, restock throttles respawn. Edit it in the file manager, restart, and the central economy applies the new numbers.",
    },
    {
      q: "How do I wipe persistence without rebuilding the server?",
      a: "Stop the server and delete mpmissions/dayzOffline.chernarusplus/storage_1 — that clears bases, buried stashes, vehicles, and characters (players.db lives inside it). Take a one-click backup first if you might want the old world back.",
    },
    {
      q: "How does admin work on DayZ?",
      a: "Admin access is BattlEye RCON with the password from your panel variables; tools like standard RCON clients handle kicks, bans, and messages. Most owners also install Workshop admin mods such as VPPAdminTools or Community Online Tools for in-game menus.",
    },
    {
      q: "Can console players join?",
      a: "No. Console DayZ is a separate ecosystem — a ReFx server runs the PC (Steam) build, and PC players find it in the Community tab or through launchers.",
    },
    {
      q: "Can I run a map other than Chernarus?",
      a: "Yes. Install the map mod (Namalsk, Deer Isle, Banov, and others) plus its mission files, then point the mission template entry in serverDZ.cfg at the new mission folder. Map mods ship their own mpmissions with instructions.",
    },
    {
      q: "Why can I see detailed logs in the ReFx console?",
      a: "DayZ logs to .RPT and .ADM files in the profiles directory rather than stdout. The ReFx launcher tails the newest .RPT into the panel console and re-targets it when DayZ rotates the file, so crashes and mod errors are visible without downloading logs.",
    },
  ],
  relatedGames: ["project-zomboid", "seven-days-to-die", "unturned", "rust"],
  searchTerms: [
    "dayz server hosting",
    "dayz dedicated server",
    "modded dayz server hosting",
    "rent dayz server",
  ],
};

export default content;
