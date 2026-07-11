import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "minecraft-paper",
  tagline: "Paper hosting for SMPs and communities — plugin support with vanilla clients",
  heroCopy:
    "Paper is the Spigot fork that most serious survival servers run: it rewrites the tick loop, chunk system, and entity handling so a 4 GB server holds a stable 20 TPS where vanilla would stutter. Its real advantage is the plugin model — everything from claims to economies installs server-side in the plugins/ folder, so players join with a completely unmodified client. ReFx installs the latest Paper build for your chosen Minecraft version and wires server-port and query into server.properties before first boot.",
  whyDedicated: [
    "Plugins like Dynmap, world editors, and anti-cheat run continuous background work — that wants dedicated RAM and burst CPU, not whatever is left over on the host's PC after the client takes its share.",
    "A community server accumulates state worth protecting: claims, balances, player inventories. One-click and scheduled backups (plus the offsite Express add-on) cover the whole plugins/ and world tree, not just the map.",
    "Paper's performance tuning only pays off when the JVM runs alone; a dedicated heap sized to your plan avoids the GC thrash of sharing memory with a desktop session.",
    "Public SMPs attract the occasional bad actor — DDoS protection in front of the server keeps a stream-sniped IP from taking the whole community down.",
  ],
  recommendedSpecs: [
    {
      players: "1–8 friends",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "8 GB SSD",
      note: "A private SMP with a handful of light plugins",
    },
    {
      players: "10–25 players",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "The template recommendation — solid for a public survival server",
    },
    {
      players: "30+ players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "Room for Dynmap renders, large plugin suites, and pre-generated worlds",
    },
  ],
  setupSteps: [
    "Order a Paper server at /order — pick your Minecraft version (or leave it on latest) and complete checkout; provisioning starts immediately after payment.",
    "The installer fetches the newest Paper build for that version from PaperMC, accepts the EULA you agreed to, and injects your assigned port into server.properties.",
    "Watch first boot in the live console — Paper generates spawn chunks and writes its config tree (config/paper-global.yml, config/paper-world-defaults.yml, spigot.yml, bukkit.yml).",
    "Drop plugin jars into plugins/ using the file manager or SFTP, then run a restart from the panel; each plugin writes its own folder under plugins/ for configuration.",
    "Join via Multiplayer in any vanilla Java client using the panel address — port 25565 is the Java default, and your exact address:port is shown on the server overview.",
    "Hand out moderation without handing out your login: sub-users can get console and file access scoped to exactly what they need, and the live player list shows who is online at a glance.",
  ],
  modSupport:
    "Paper runs the Bukkit/Spigot plugin ecosystem — Hangar, SpigotMC, and Modrinth host thousands of server-side plugins that need nothing installed on the client. Upload jars to plugins/ and restart; config lives in plugins/<PluginName>/. Because Paper is not a mod loader, Fabric and Forge content mods will not run here — if your group wants new blocks and machines rather than commands and mechanics, the panel's loader switcher can move this same server to Fabric, Forge, or NeoForge without changing its address or losing its backups.",
  faq: [
    {
      q: "What port does a Paper server use?",
      a: "The same as any Java Edition server: 25565 by default. ReFx writes your allocated port into server-port and query.port in server.properties automatically, so whatever address the panel shows is exactly what players type into the client.",
    },
    {
      q: "How do I install plugins?",
      a: "Download the jar for your Minecraft version from Hangar, SpigotMC, or Modrinth, upload it into plugins/ via the file manager or SFTP, and restart from the panel. The plugin creates plugins/<Name>/config.yml on first boot; edit it in the file manager and run the plugin's reload command from the live console where supported.",
    },
    {
      q: "Can I move my existing Spigot or vanilla world to Paper?",
      a: "Yes — Paper is drop-in compatible. Upload the world folder and set level-name in server.properties. Coming from vanilla specifically, split the dimensions: copy world/DIM-1 into world_nether/ and world/DIM1 into world_the_end/ (keeping the DIM subfolders), because Paper stores the nether and end as separate worlds.",
    },
    {
      q: "How do I update Paper to a new Minecraft version?",
      a: "Change the version variable in the panel and restart — the installer pulls the latest Paper build for that release. Back up first: world upgrades are one-way, and plugins sometimes lag a new Minecraft release by days or weeks, so check your critical plugins before jumping the whole server.",
    },
    {
      q: "Do players need to install anything to join?",
      a: "No. Plugins are entirely server-side, so any vanilla Java Edition client on the matching version connects normally. If you want a wider version window, the ViaVersion plugin lets newer clients join an older server; Bedrock players need the Geyser plugin as a translation layer.",
    },
    {
      q: "Why Paper instead of vanilla for a survival server?",
      a: "Throughput and control. Paper's async chunk loading and entity optimizations keep TPS stable under player load, and its config exposes things vanilla hardcodes — spawn limits, TNT mechanics, anti-xray. You keep vanilla gameplay by default and opt into changes deliberately.",
    },
  ],
  relatedGames: ["minecraft", "minecraft-fabric", "minecraft-neoforge", "terraria"],
  searchTerms: [
    "paper server hosting",
    "papermc server hosting",
    "minecraft paper server hosting",
    "minecraft plugin server hosting",
  ],
};

export default content;
