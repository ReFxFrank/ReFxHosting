import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "tmodloader",
  tagline: "tModLoader server hosting for Calamity, Thorium, and hundred-mod packs — the Mods folder is yours.",
  heroCopy:
    "tModLoader is the content side of Terraria modding: Calamity's new bosses, Thorium's classes, Magic Storage — all of it loads as .tmod files on both server and client. Running the server well is mostly version discipline: the Mods folder plus enabled.json define your pack, and joining players sync against it. Unlike a TShock setup, players here run tModLoader themselves; unlike Host and Play, your pack keeps its world running when the host logs off.",
  whyDedicated: [
    "Big packs are long campaigns — Calamity progression alone spans weeks — and a dedicated server keeps one canonical world instead of pass-the-save.",
    "Mod count drives memory: a dedicated RAM allocation loads a heavy pack reliably where a host's leftover headroom fails at boot.",
    "The server's enabled.json is the single source of truth for the pack — clients are prompted to match it on join rather than guessing versions.",
    "Server-side autosave plus panel backups protect a world that mod updates can occasionally corrupt.",
  ],
  recommendedSpecs: [
    {
      players: "1–8 players, small packs",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "5 GB SSD",
      note: "A dozen quality-of-life mods.",
    },
    {
      players: "8 players, mid-size packs",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "5 GB SSD",
      note: "Recommended — Calamity-scale packs run here.",
    },
    {
      players: "More players or huge packs",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "Kitchen-sink modpacks or a raised player cap.",
    },
  ],
  setupSteps: [
    "Order tModLoader at /order — it is a separate template from vanilla Terraria (TShock).",
    "Provisioning installs tModLoader via SteamCMD and seeds serverconfig.txt with your world name, world size, and player cap.",
    "Upload .tmod files to .local/share/Terraria/tModLoader/Mods over SFTP and list their internal names in Mods/enabled.json, then restart and watch the console while mods load.",
    "Adjust serverconfig.txt in the file manager for password, difficulty, and world settings.",
    "Players install tModLoader (free for Terraria owners on Steam) and use Join via IP at your-address:7777 — the client offers to fetch missing Workshop mods on connect.",
  ],
  modSupport:
    "Mods are .tmod files published through the Steam Workshop. On the server they live in .local/share/Terraria/tModLoader/Mods, with Mods/enabled.json controlling the active set — upload them via SFTP or the file manager, or build the set locally in your tModLoader client and copy the folder up. Keep the server and every client on the same tModLoader release channel (monthly stable versus preview): a .tmod built against a newer tModLoader will refuse to load on an older server, which is the most common cause of a pack that boots for you and nobody else.",
  faq: [
    {
      q: "What port does a tModLoader server use?",
      a: "The same as vanilla Terraria: 7777/TCP by default, settable with a port= line in serverconfig.txt. Players join via IP with address:port from tModLoader's multiplayer menu.",
    },
    {
      q: "How do I install Calamity or any other Workshop mod?",
      a: "Copy the .tmod file from your own client (steamapps/workshop/content/1281930/<workshop-id>) into the server's Mods folder, then add the mod's internal name — CalamityMod, for example — to Mods/enabled.json and restart. The console lists every mod as it loads, so failures are easy to spot.",
    },
    {
      q: "Do players need the exact same mods?",
      a: "Yes — every gameplay mod on the server must be present client-side. tModLoader detects the server's list when connecting and offers to download missing mods from the Workshop, so joining a well-configured server is mostly automatic.",
    },
    {
      q: "How do I move a modded world across?",
      a: "Modded worlds are two files: the .wld plus a .twld sidecar holding modded tiles and data. Copy both from Documents/My Games/Terraria/tModLoader/Worlds into the server's .local/share/Terraria/tModLoader/Worlds and set the world name to match — a .wld without its .twld loses modded content.",
    },
    {
      q: "Can vanilla Terraria players join?",
      a: "No, tModLoader clients only. If you want vanilla clients with server-side plugins instead, switch this server to the Terraria (TShock) template from the panel — address, backups, and billing carry over.",
    },
    {
      q: "How should I handle tModLoader's monthly updates?",
      a: "Deliberately. tModLoader ships monthly, and large mods sometimes lag a release behind — update the server only after your pack's critical mods are confirmed compatible, and take a backup before you do.",
    },
  ],
  relatedGames: ["terraria", "core-keeper", "minecraft"],
  searchTerms: [
    "tmodloader server hosting",
    "modded terraria server hosting",
    "calamity mod server",
    "tmodloader dedicated server",
  ],
};

export default content;
