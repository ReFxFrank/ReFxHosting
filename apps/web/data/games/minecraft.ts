import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "minecraft",
  tagline: "One Minecraft server, every loader — Vanilla, Paper, Fabric, Forge, or NeoForge on demand",
  heroCopy:
    "Minecraft: Java Edition is really five server platforms wearing one name, and the right choice depends on whether you want plugins, content mods, or plain vanilla survival. ReFx treats the loader as a setting, not a commitment: pick Vanilla, Paper, Fabric, Forge, or NeoForge at order time and switch later from the panel without rebuilding your server. The version picker works the same way — pin 1.21.1 for your modpack today, move to the newest release when your mods catch up.",
  whyDedicated: [
    "An 'Open to LAN' world only exists while your PC is on and everyone is on the same network; a dedicated server keeps the world running for players in any time zone.",
    "Hosting from a home PC means port forwarding, exposing your home IP, and sharing RAM with the client — a dedicated server gets its own allocation with dedicated RAM and burst CPU for chunk generation spikes.",
    "Java garbage collection pauses get worse as the heap fills; a server-tuned JVM with a fixed heap (set per plan) keeps tick times steadier than a desktop running the client and server together.",
    "Public server lists and Realms alternatives cap your control; on your own server you choose the loader, the version, the datapacks, and who gets operator.",
  ],
  recommendedSpecs: [
    {
      players: "1–5 friends",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "8 GB SSD",
      note: "Vanilla or Paper with a small view distance",
    },
    {
      players: "10–20 players",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "The template recommendation — comfortable for an SMP on Paper",
    },
    {
      players: "20+ or modpacks",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "Headroom for Fabric/Forge content mods or a large public map",
    },
  ],
  setupSteps: [
    "Pick a Minecraft plan on the order page, choose your loader (Paper is the default) and version, and check out — the server provisions itself as soon as payment clears.",
    "The installer downloads the matching server build, writes eula.txt after you accept the Mojang EULA, and sets server-port in server.properties automatically.",
    "Open the live console in the panel to watch the first boot finish, then use the file manager to adjust server.properties — motd, difficulty, white-list, view-distance.",
    "To run a modpack instead of a fresh world, use the one-click CurseForge or Modrinth installer; it deploys the pack server-side and strips client-only mods so the server actually boots.",
    "Connect in Minecraft via Multiplayer, then Add Server, using your server address — the default Java Edition port is 25565.",
    "Add friends to the whitelist from the console (whitelist add <name>) and give co-admins panel access as sub-users with only the permissions they need.",
  ],
  modSupport:
    "This template is loader-agnostic, so the mod story follows whatever you pick: Bukkit/Spigot plugins on Paper, content mods on Fabric, Forge, or NeoForge, and datapacks everywhere including Vanilla. The panel's CurseForge and Modrinth installers set up full modpacks in one click — including the right loader and version — and drop client-only mods that would crash a headless server. You can also manage plugins/ or mods/ by hand over SFTP, and the loader switcher means trying Fabric after a year on Paper does not mean starting a new server.",
  faq: [
    {
      q: "What is the default Minecraft server port?",
      a: "Java Edition uses 25565. ReFx assigns your server's port at provisioning and writes it into server.properties (server-port) for you, so the address shown in the panel is exactly what players paste into the Add Server screen.",
    },
    {
      q: "Can I upload my single-player world?",
      a: "Yes. On your PC the world lives at %APPDATA%\\.minecraft\\saves\\<world name> (Windows) or ~/Library/Application Support/minecraft/saves on macOS. Zip it, upload it through the file manager or SFTP, extract it next to server.jar, and set level-name in server.properties to the folder name. On Paper, also move the dimension data: world/DIM-1 into world_nether/ and world/DIM1 into world_the_end/, keeping the DIM folders intact.",
    },
    {
      q: "Which loader should I start with?",
      a: "Paper for survival and SMP servers that want plugins without client installs; Fabric for lightweight, fast-updating content mods; Forge or NeoForge for the big CurseForge-style modpacks. If you are unsure, start on Paper — the loader switcher lets you change your mind later while keeping the same address, files, and backups.",
    },
    {
      q: "Can I change the Minecraft version later?",
      a: "Yes — the version is a panel variable, not a reinstall. Take a backup first, because worlds upgrade forward cleanly but do not downgrade: chunks written by 1.21 will not load on 1.20. Pin an exact version for modpacks and only move when every mod supports the target release.",
    },
    {
      q: "Can Bedrock players (phones, consoles) join a Java server?",
      a: "Not natively — Java and Bedrock are separate networks. The practical bridge is the Geyser plugin on a Paper server, which translates Bedrock clients into Java connections; it works well for survival play but some plugins and resource-pack features behave differently for Bedrock players.",
    },
    {
      q: "How much RAM does a Minecraft server actually need?",
      a: "On Paper, 4 GB comfortably runs 10–20 players at a sane view distance. Vanilla wants more headroom per player, and modded servers scale with the pack rather than the player count — a 200-mod pack can want 6–8 GB with two players online. The panel sets the JVM heap (-Xmx) to match your plan automatically.",
    },
    {
      q: "What happens to my world if my group switches games?",
      a: "You can switch this server to a different game — Palworld, Valheim, anything in the catalog — while keeping the same address, backup history, and subscription. Take a backup before switching; if the group drifts back to Minecraft, switch again and restore it.",
    },
  ],
  relatedGames: ["minecraft-paper", "minecraft-fabric", "minecraft-forge", "terraria"],
  searchTerms: [
    "minecraft server hosting",
    "minecraft java server hosting",
    "host a minecraft server",
    "modded minecraft server hosting",
    "minecraft server rental",
  ],
};

export default content;
