import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "astroneer",
  tagline: "Astroneer server hosting — a persistent solar system your friends can land on any time.",
  heroCopy:
    "Astroneer co-op is host-bound: the solar system exists while the host plays and everyone else visits. A dedicated server turns it into a persistent shared system — bases, rail lines, and half-terraformed planets waiting exactly as you left them for whoever logs in next. The ReFx template ships sensible engine defaults (30 fps simulation with players on, throttling to 3 fps when empty), so an always-on server does not burn CPU while nobody is playing.",
  whyDedicated: [
    "The save lives on the server rather than with whoever hosted last, ending the save-file relay after every session.",
    "AstroServerSettings.ini gives you an owner role and an explicit allowlist (DenyUnlistedPlayers) — access control that outlives any single session.",
    "Astroneer's dedicated servers are cross-platform, so Steam and console friends can share the same address.",
    "Long terraforming and automation projects stay put, and scheduled backups snapshot the .savegame before someone tunnels through the base.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 astroneers",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "5 GB SSD",
      note: "A starter system with light bases.",
    },
    {
      players: "4–8 astroneers",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "5 GB SSD",
      note: "Recommended for the default 8-player cap.",
    },
    {
      players: "8+ with heavy automation",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "Large bases, rail networks, and raised player counts.",
    },
  ],
  setupSteps: [
    "Order Astroneer at /order, then put your exact in-game name in the OwnerName variable so you spawn with owner permissions.",
    "Provisioning installs the Windows server via SteamCMD and seeds Astro/Saved/Config/WindowsServer/AstroServerSettings.ini with your server name and owner.",
    "Adjust AstroServerSettings.ini in the file manager — server password, DenyUnlistedPlayers for allowlist-only play, and the autosave interval.",
    "In Astroneer, open Dedicated Servers, add your-address:8777, and join.",
    "Schedule backups of Astro/Saved/SaveGames — each world is a single .savegame file, so keeping many versions is cheap.",
  ],
  modSupport: null,
  faq: [
    {
      q: "What port does an Astroneer server use?",
      a: "The conventional Astroneer server port is 8777/UDP. Your server's actual assigned address:port is on the panel overview — that exact string is what players paste into the in-game Dedicated Servers menu.",
    },
    {
      q: "How do owner and admin permissions work?",
      a: "The OwnerName in AstroServerSettings.ini must match your in-game name exactly; the owner manages the server from inside the game. Additional players and roles accumulate in the same file, and DenyUnlistedPlayers=true turns it into a strict allowlist.",
    },
    {
      q: "Can I move my existing save to the server?",
      a: "Yes. Upload the .savegame from your local install (under AppData/Local/Astro/Saved/SaveGames for Steam players) into Astro/Saved/SaveGames on the server, then set ActiveSaveFileDescriptiveName in AstroServerSettings.ini to its name and restart.",
    },
    {
      q: "Does Astroneer support crossplay on dedicated servers?",
      a: "Yes — dedicated servers are the crossplay path in Astroneer, with PC and console players joining the same server by its address. Every platform sees the same world and the same allowlist rules.",
    },
    {
      q: "Why does the server look idle when nobody is on?",
      a: "By design. The template sets MaxServerFramerateWhileEmpty to 3 fps, so the simulation naps between sessions and snaps back to 30 fps the moment someone joins. It saves CPU without affecting the saved world.",
    },
    {
      q: "How do I start a new solar system without losing the old one?",
      a: "Change ActiveSaveFileDescriptiveName to a new name and restart — the server creates a fresh .savegame while the previous file stays in SaveGames, ready to switch back to.",
    },
  ],
  relatedGames: ["satisfactory", "avorion", "factorio"],
  searchTerms: [
    "astroneer server hosting",
    "astroneer dedicated server",
    "rent astroneer server",
    "astroneer crossplay server",
  ],
};

export default content;
