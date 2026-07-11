import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "unturned",
  tagline: "Unturned servers built for Rocket and OpenMod plugins and curated workshop maps.",
  heroCopy:
    "Unturned's server meta runs on plugins: RocketMod — continued today as LDM — and its successor OpenMod power the kits, economies, teleports, and moderation commands on virtually every popular server, and they install by dropping plugin files into your instance's Rocket folder. Configuration is one plain file, Commands.dat, where lines like Map Russia, Perspective First, and Mode Hard define the ruleset. Workshop maps and item mods load server-side through WorkshopDownloadConfig.json.",
  whyDedicated: [
    "Bases and player progress live server-side under the instance folder — an always-on host is the save file's insurance, and scheduled backups snapshot it.",
    "Economy and kit plugins are what make Unturned servers sticky, and they need a stable address with a process that outlives anyone's play session.",
    "Unturned is light — 2 GB covers the template recommendation — so what you are buying is reliability and DDoS protection, not raw size.",
    "Sub-users let co-owners restart the server, edit Commands.dat, and manage backups without sharing your login.",
  ],
  recommendedSpecs: [
    {
      players: "Friends survival (up to 16)",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "8 GB SSD",
      note: "The template recommendation.",
    },
    {
      players: "Community server (24-48) with Rocket plugins",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
    },
    {
      players: "Large modded or RP server (48+)",
      ram: "4 GB",
      cpu: "4 vCPU",
      storage: "16 GB SSD",
    },
  ],
  setupSteps: [
    "Order an Unturned server at /order; it provisions automatically and SteamCMD installs app 1110390 with a ready-made instance at Servers/refx.",
    "Panel variables seed Servers/refx/Server/Commands.dat with your name, map, slots, and perspective; edit the same file for difficulty, cheats, and whitelist rules.",
    "Install plugins over SFTP into the instance's Rocket/Plugins folder (RocketMod/LDM), or use OpenMod's package commands from the console.",
    "List workshop map and mod IDs in WorkshopDownloadConfig.json so the server downloads them, then set Map in Commands.dat to the new map's name.",
    "Connect from the in-game server list or by IP — the default port is UDP 27015.",
  ],
  modSupport:
    "Two plugin ecosystems plus the Steam Workshop: RocketMod (LDM) still has the largest plugin catalog, OpenMod is the actively developed successor with its own package manager, and both live inside your server instance. Workshop content — curated maps and item mods — is fetched server-side via WorkshopDownloadConfig.json, and joining players download the same items automatically.",
  faq: [
    {
      q: "What port does an Unturned server use?",
      a: "UDP 27015 by default, with Steam query traffic on the adjacent port. Join by IP from the in-game connect screen using your address and port from the panel.",
    },
    {
      q: "How do I become admin?",
      a: "Add Owner followed by your SteamID64 to Commands.dat, or grant admin from the live console with admin plus the SteamID64. Rocket permission groups then layer fine-grained roles on top.",
    },
    {
      q: "Rocket or OpenMod — which should I use?",
      a: "RocketMod (LDM) has the biggest plugin catalog and most guides; OpenMod is the modern successor and can load many Rocket plugins through a compatibility layer. Pick one as your base — most communities still start with Rocket.",
    },
    {
      q: "How do I run a workshop map?",
      a: "Put the map's workshop ID in WorkshopDownloadConfig.json, let the server download it on boot, then set Map in Commands.dat to the map's exact name.",
    },
    {
      q: "Where are saves stored, and can I wipe?",
      a: "World and player data persist per map under the Servers/refx folder. One-click backups snapshot everything; to wipe, stop the server and delete the map's save data — plugins and config stay put.",
    },
    {
      q: "We might try another game later — do we need a new server?",
      a: "No. Game switching moves the same server to a different template while keeping its address, backups, and billing, so a community vote does not mean starting over.",
    },
  ],
  relatedGames: ["rust", "dayz", "project-zomboid", "garrys-mod"],
  searchTerms: [
    "unturned server hosting",
    "unturned dedicated server",
    "unturned rocket server",
    "unturned rp server hosting",
  ],
};

export default content;
