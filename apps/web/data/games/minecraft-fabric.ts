import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "minecraft-fabric",
  tagline: "Fabric hosting for lightweight modded Minecraft that keeps pace with new releases",
  heroCopy:
    "Fabric is the loader you pick when you want mods without the bulk: it boots fast, updates to new Minecraft releases within days instead of months, and its ecosystem leans on small composable mods rather than monolithic packs. It also has the best server-side performance stack in modded Minecraft — Lithium, FerriteCore, and Krypton optimize ticking, memory, and networking with zero client requirements. ReFx installs fabric-server-launch.jar with your chosen game and loader versions (the template defaults to Minecraft 1.21.1) and resolves stable loader builds automatically.",
  whyDedicated: [
    "Content mods multiply entity counts and block updates — Create contraptions and tech-mod machines tick even when nobody is nearby, which needs dedicated RAM and burst CPU rather than a share of the host's desktop.",
    "Fabric packs update often; scheduled backups before every change mean a broken mod update is a restore, not a lost world.",
    "A LAN-hosted modded world dies the moment the host closes the game — a dedicated server lets your group's automation, farms, and villager halls run on a schedule you control with crash auto-restart behind it.",
    "Version discipline matters in modded Minecraft: a server pinned to exact game and loader versions guarantees every player joins with a matching client instead of chasing a moving target.",
  ],
  recommendedSpecs: [
    {
      players: "1–5 friends",
      ram: "2 GB",
      cpu: "1 vCPU",
      storage: "8 GB SSD",
      note: "Near-vanilla Fabric with server-side performance mods",
    },
    {
      players: "5–15 players",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "The template recommendation — fits most Fabric packs of 50–150 mods",
    },
    {
      players: "Large packs or 15+ players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "For kitchen-sink packs and heavy worldgen mods",
    },
  ],
  setupSteps: [
    "Order a Fabric server at /order — set the Minecraft version your pack targets (1.21.1 is the template default) and check out; the server builds itself right after payment.",
    "The installer fetches the Fabric server launcher for your game and loader versions from FabricMC, verifies fabric-server-launch.jar, and sets your port in server.properties.",
    "Install your pack: use the one-click Modrinth or CurseForge modpack installer, which deploys the server files and strips client-only mods like Sodium that would crash a headless server — or upload individual mods to mods/ over SFTP.",
    "Boot from the panel and watch the live console; almost every Fabric mod depends on Fabric API, so if boot fails on a missing dependency, drop fabric-api into mods/ first.",
    "Connect with a Fabric client running the same Minecraft version and mods — add the panel's address in Multiplayer; the default Java port is 25565.",
    "Share your modlist with friends (a Modrinth pack link keeps everyone in sync) and add a trusted co-admin as a sub-user with console-only permissions.",
  ],
  modSupport:
    "Mods live in mods/, and Modrinth is Fabric's home turf — the panel installs Modrinth packs (and CurseForge ones) in one click, resolving the right loader version and removing client-only mods such as Sodium, Iris, and minimap renderers so the server boots clean. Content mods must also be installed on every player's client at matching versions; server-only mods like Lithium, FerriteCore, Krypton, and Spark can be added freely without touching anyone's client. Per-mod settings appear under config/ after first boot, editable in the file manager.",
  faq: [
    {
      q: "What port does a Fabric server run on?",
      a: "25565, the standard Java Edition port. The installer writes your allocated port into server.properties (server-port), and the exact address:port players should use is shown on your panel overview page.",
    },
    {
      q: "Do my friends need Fabric installed to join?",
      a: "If the server runs content mods, yes — each player needs the Fabric loader plus the same mods at compatible versions, which is why sharing a Modrinth modpack beats passing around a zip. If you only run server-side mods (performance, chat, anti-cheat), vanilla clients on the matching Minecraft version join normally.",
    },
    {
      q: "How do I move my existing Fabric world onto the server?",
      a: "Copy the world from your PC (%APPDATA%\\.minecraft\\saves\\<name> on Windows), upload and extract it via SFTP, and point level-name in server.properties at the folder. Upload the same mods/ and config/ folders too — a world saved with worldgen mods will refuse to load its biomes without them.",
    },
    {
      q: "Can I change Minecraft or Fabric loader versions later?",
      a: "Both are panel variables: set an exact game version or leave the loader on latest stable and restart. Take a backup first and move only when every mod in your list supports the target release — worlds upgrade forward but never back.",
    },
    {
      q: "Why do modpack installs remove some mods?",
      a: "Mods like Sodium, Iris, and Mod Menu are client-only — they hook rendering and UI code that does not exist on a dedicated server and crash it at boot. The one-click installer strips them server-side while your players keep them locally, which is the correct split.",
    },
    {
      q: "Fabric or Forge — which should my group use?",
      a: "Pick by pack, not loyalty: if the pack you want ships for Fabric, use this template; if it is a classic CurseForge Forge pack, use the Forge one. Since the loader is switchable on a ReFx server without changing address or losing backups, choosing wrong costs a switch, not a migration.",
    },
  ],
  relatedGames: ["minecraft-paper", "minecraft-neoforge", "minecraft", "core-keeper"],
  searchTerms: [
    "fabric server hosting",
    "minecraft fabric server hosting",
    "fabric modpack server hosting",
    "modrinth modpack server",
  ],
};

export default content;
