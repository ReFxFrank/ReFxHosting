import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "minecraft-forge",
  tagline: "Forge hosting built for the big modpacks — CurseForge packs deployed in one click",
  heroCopy:
    "Forge is modded Minecraft's incumbent: fifteen years of mods, and the loader behind the classic CurseForge packs — the tech trees, magic mods, and 200-mod kitchen sinks people actually mean when they say 'modded Minecraft'. Modern Forge servers launch through argument files (user_jvm_args.txt and unix_args.txt) rather than a single jar, which ReFx sets up and verifies during install so you never see the cryptic 'unable to access jarfile' failure. The template defaults to Minecraft 1.21.1 with Forge's recommended build and gets 6 GB of RAM by default, because Forge packs are hungry.",
  whyDedicated: [
    "Big Forge packs routinely idle at 4–6 GB of heap before a single player joins — running that alongside a client on one PC starves both; a dedicated allocation sizes the JVM to the plan.",
    "Chunk generation with worldgen mods is the most CPU-intensive thing Minecraft does; burst CPU absorbs exploration spikes that would freeze a shared host.",
    "Pack updates break things — mod authors remove blocks, registries shift. Scheduled backups before every update turn a corrupted world into a five-minute restore.",
    "Machines, farms, and quests progress while the group is offline only if the server is always on; crash auto-restart plus a nightly scheduled restart keeps long-running packs from degrading.",
  ],
  recommendedSpecs: [
    {
      players: "2–5 friends, lighter packs",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "Packs under roughly 100 mods",
    },
    {
      players: "5–10 players, standard packs",
      ram: "6 GB",
      cpu: "2 vCPU",
      storage: "15 GB SSD",
      note: "The template recommendation — fits most mainstream CurseForge packs",
    },
    {
      players: "10+ players or kitchen sinks",
      ram: "10 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "For 250+ mod packs and heavily automated bases",
    },
  ],
  setupSteps: [
    "Order a Forge server at /order — pick the Minecraft version your pack needs (1.21.1 default, Forge build resolves to recommended) and check out; provisioning is automatic once payment clears.",
    "The installer runs the official Forge installer, generates the libraries tree and launch argument files, and verifies unix_args.txt and user_jvm_args.txt exist before first boot.",
    "Install your pack with the one-click CurseForge or Modrinth installer — it deploys the server version of the pack and strips client-only mods (shaders, minimaps) that crash dedicated servers.",
    "Use the live console for first boot: Forge packs take a few minutes to build registries on a fresh world, and the console shows exactly which mod is loading if something stalls.",
    "Connect using the matching client pack — the CurseForge app installs it for players — via the panel address; Java Edition's default port is 25565.",
    "Take a manual backup once the world is generated and set a backup schedule; give a co-admin sub-user access so someone can restart the server when you are not around.",
  ],
  modSupport:
    "This is the loader for the CurseForge catalog: the panel's one-click installer deploys any CurseForge (or Modrinth) Forge pack server-side, keeping mods/, config/, and defaultconfigs/ intact while removing client-only mods that a headless server cannot load. Individual mods install by dropping jars into mods/ over SFTP or the file manager — every player's client must carry the same content mods at compatible versions. KubeJS scripts, datapacks, and per-mod configs under config/ are all editable in the file manager, and the version picker pins the exact Forge build a pack demands.",
  faq: [
    {
      q: "What port do players connect to?",
      a: "25565 is Java Edition's default; your server's exact address:port sits on the panel overview and is already written into server.properties. Players add it under Multiplayer in a client running the same pack.",
    },
    {
      q: "How do I host a specific CurseForge modpack?",
      a: "Use the one-click CurseForge installer in the panel and pick the pack and pack version. It deploys the server files, prunes client-only mods, and matches the Forge build the pack requires. Players install the same pack through the CurseForge app — versions must match on both sides.",
    },
    {
      q: "Can I bring my existing modded world?",
      a: "Yes — upload the world folder plus your mods/ and config/ directories over SFTP, and set level-name in server.properties. The mod list must match what the world was saved with: missing worldgen or content mods means missing biomes and vanished machines, so copy the whole trio (world, mods, config) together.",
    },
    {
      q: "Why does my Forge server want so much RAM?",
      a: "Forge packs load every registered block, item, and recipe into the heap at boot, before any chunks are loaded. A 150-mod pack commonly sits at 4 GB idle, which is why this template recommends 6 GB — the panel sizes the JVM heap (via user_jvm_args.txt and -Xmx) to your plan automatically.",
    },
    {
      q: "How do updates work when my pack releases a new version?",
      a: "Back up, then rerun the pack installer at the new pack version (or update mods/ manually for hand-rolled lists). Stay on the same Minecraft version unless the pack itself moves; when it does, remember world upgrades are one-way. The Forge build is a panel variable, so matching a pack's pinned Forge version is a settings change, not a reinstall.",
    },
    {
      q: "What is the difference between Forge and NeoForge?",
      a: "NeoForge forked from Forge in 2023 and most of the active modding scene moved there for Minecraft 1.20.4 and newer, while the back catalog of classic packs remains Forge. Pick the loader your target pack ships for — and since ReFx can switch this server's loader in place, a pack migration to NeoForge does not mean a new server.",
    },
  ],
  relatedGames: ["minecraft-neoforge", "minecraft-fabric", "minecraft", "tmodloader"],
  searchTerms: [
    "forge server hosting",
    "minecraft forge server hosting",
    "curseforge modpack server hosting",
    "modded minecraft server hosting",
  ],
};

export default content;
