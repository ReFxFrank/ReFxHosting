import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "terraria",
  tagline: "Terraria server hosting on TShock — vanilla clients, server-side plugins, real admin tooling.",
  heroCopy:
    "ReFx runs Terraria through TShock, which means players connect with completely unmodified Terraria while the server side gains groups, permissions, ban management, and a plugin API. That is the key distinction from tModLoader: TShock changes what the server can do, not what players must install. Region protection, warps, server-side characters, and a REST API are each one plugin (or one config flag) away.",
  whyDedicated: [
    "Host and Play ties the world to one machine and hands out one shared trust level; TShock gives ranked groups, per-command permissions, and persistent ban lists.",
    "Server-side characters keep inventories on the server, closing the local-save item-spawn loophole that plagues open vanilla servers.",
    "A 24/7 world means shared bases, NPC housing, and event progress exist for everyone, not just while the host is online.",
    "The panel console is the TShock command line — run setup, kicks, and world commands without joining the game.",
  ],
  recommendedSpecs: [
    {
      players: "1–8 players",
      ram: "1 GB",
      cpu: "1 vCPU",
      storage: "4 GB SSD",
      note: "A small world among friends.",
    },
    {
      players: "8–16 players",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "4 GB SSD",
      note: "Recommended — a medium or large world plus a handful of plugins.",
    },
    {
      players: "16+ players",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "8 GB SSD",
      note: "Busy community servers with SSC and a full plugin folder.",
    },
  ],
  setupSteps: [
    "Order Terraria at /order — the template installs TShock, and the TSHOCK_VERSION variable pins a release tag or tracks the latest stable.",
    "Provisioning auto-creates your world on first boot; name, size (small through large), and difficulty (Classic through Journey) come from the startup variables.",
    "Grab the one-time setup code from the live console, join the server, run /setup <code> in chat to claim superadmin, then create a permanent account with /user add.",
    "Drop plugin .dll files into ServerPlugins/ via the file manager or SFTP and restart — each plugin writes its config under the tshock/ folder.",
    "Players connect with stock Terraria: Multiplayer, Join via IP, your-address:7777.",
  ],
  modSupport:
    "TShock is a plugin platform, not a content mod: server-side .dll plugins load from ServerPlugins/ and vanilla clients join without installing anything. TShock's core already covers regions, warps, permissions, and server-side characters; community plugins from the Pryaxis ecosystem layer on economies, minigames, and moderation depth. If what you actually want is content mods — Calamity, Thorium, new bosses — that is tModLoader, and you can switch this server to the tModLoader template from the panel while keeping your address, backups, and billing.",
  faq: [
    {
      q: "What port does Terraria use?",
      a: "7777/TCP by default — Terraria is one of the few games on TCP rather than UDP. The template wires the assigned port into TShock's config; players join with address:port from the multiplayer menu.",
    },
    {
      q: "Can I upload an existing world?",
      a: "Yes. Copy the .wld file from Documents/My Games/Terraria/Worlds on your PC into the server's worlds/ folder via the file manager, set the World Name variable to the file name, and restart. Journey-mode worlds only admit Journey characters, so match your world type to your community.",
    },
    {
      q: "TShock or tModLoader — which do I want?",
      a: "TShock for a vanilla-client server with admin tooling and anti-cheat; tModLoader for content mods that every player installs. They are separate templates at ReFx, and game switching moves you between them without a new server or address.",
    },
    {
      q: "What are server-side characters?",
      a: "With ServerSideCharacters enabled in tshock/config.json, inventories and stats live on the server instead of in local player files. Everyone starts fresh on your server and items can only come from your world — the standard defense against inventory cheating.",
    },
    {
      q: "What happens when Terraria updates?",
      a: "Clients and server must be on matching versions. Steam updates players immediately while TShock ships a compatible build shortly after, so pin TSHOCK_VERSION during the gap or players will see a version mismatch at join.",
    },
    {
      q: "Can mobile or console players join?",
      a: "No — out of the box, a TShock server admits desktop Terraria (Steam/GOG) on the matching version only.",
    },
    {
      q: "Should I back up before the Wall of Flesh?",
      a: "Yes. Defeating it flips the world into hardmode and permanently rewrites world generation with new biome spread. A one-click backup beforehand preserves the pre-hardmode world if your group ever wants it back.",
    },
  ],
  relatedGames: ["tmodloader", "core-keeper", "minecraft"],
  searchTerms: [
    "terraria server hosting",
    "tshock server hosting",
    "terraria dedicated server",
    "rent terraria server",
  ],
};

export default content;
