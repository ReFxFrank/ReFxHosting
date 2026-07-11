import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "minecraft-neoforge",
  tagline: "NeoForge hosting for modern modded Minecraft on 1.20.4 and beyond",
  heroCopy:
    "NeoForge is where Forge's modding community went: forked in 2023, it now carries most active mod development for Minecraft 1.20.4 and newer, and the current generation of large packs increasingly ships NeoForge-first. Server-side it launches the modern Forge way — through user_jvm_args.txt and unix_args.txt argument files — which the ReFx installer generates and verifies so a broken install fails loudly instead of booting into a JVM error. The template defaults to Minecraft 1.21.1 and resolves the newest stable NeoForge build for your chosen game version.",
  whyDedicated: [
    "Current-generation packs are heavier than their 1.12-era ancestors — more registries, more data generation, more worldgen — and the template's 6 GB baseline assumes a dedicated heap, not a slice of a gaming PC.",
    "NeoForge moves fast alongside new Minecraft releases; pinning the server to exact game and loader versions gives your players one stable target while you test updates against a backup.",
    "Automation-heavy bases (Create, Mekanism, Ars Nouveau setups) keep ticking only on an always-on server — with crash auto-restart and restart schedules covering the long sessions nobody is watching.",
    "A dedicated address means the pack, the world, and the whitelist survive host changes — nobody's home IP or upload bandwidth is a dependency.",
  ],
  recommendedSpecs: [
    {
      players: "2–5 friends, lighter packs",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "Small NeoForge mod lists under about 100 mods",
    },
    {
      players: "5–10 players, standard packs",
      ram: "6 GB",
      cpu: "2 vCPU",
      storage: "15 GB SSD",
      note: "The template recommendation for mainstream 1.21-era packs",
    },
    {
      players: "10+ players or large packs",
      ram: "10 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "Headroom for 200+ mod lists and heavy automation",
    },
  ],
  setupSteps: [
    "Order a NeoForge server at /order, set the Minecraft version your pack targets (1.21.1 by default), and complete checkout — the server provisions automatically after payment.",
    "The installer pulls the matching NeoForge release from the official maven, runs its server installer, and confirms the unix_args.txt and user_jvm_args.txt launch files landed correctly.",
    "Deploy your pack via the one-click CurseForge or Modrinth installer — client-only mods are stripped automatically — or upload jars into mods/ over SFTP for a hand-built list.",
    "Follow the first boot in the live console; registry and datapack generation on a fresh NeoForge world takes a few minutes and the console names any mod that fails to load.",
    "Join with a client running the identical pack and Minecraft version through the address on your panel overview — Java Edition defaults to port 25565.",
    "Schedule backups before your pack's update day and add a co-admin as a sub-user so restarts and mod swaps do not bottleneck on one person.",
  ],
  modSupport:
    "NeoForge mods install to mods/ with per-mod settings appearing under config/ — all manageable through the file manager or SFTP. The panel's one-click CurseForge and Modrinth installers handle full NeoForge packs, matching the loader build a pack pins and removing client-only mods (shaders, UI overlays, minimaps) that would crash a headless server; players run the same pack client-side, where those mods stay. Most Forge mods from 1.20.1 and earlier are not drop-in compatible — check that each mod in a custom list ships a NeoForge build for your Minecraft version, and use the loader switcher if your list turns out to live on classic Forge instead.",
  faq: [
    {
      q: "What is the default port for a NeoForge server?",
      a: "25565, like every Minecraft Java Edition server. Your allocated port is written into server.properties at install time and displayed as address:port on the panel overview — that string is what players add under Multiplayer.",
    },
    {
      q: "NeoForge or Forge — does it actually matter which I pick?",
      a: "For 1.20.1 and older packs, Forge; for most actively developed 1.20.4+ and 1.21+ packs, NeoForge. The two diverged after the 2023 fork, so jars are generally not interchangeable. On ReFx the loader is switchable in place — same address, files, and backups — so picking wrong is recoverable in minutes.",
    },
    {
      q: "How do I install a modpack?",
      a: "Use the panel's CurseForge or Modrinth installer, choose the pack and exact pack version, and let it deploy the server files with client-only mods stripped. Manual alternative: upload the pack's server files into the server root over SFTP, keeping mods/, config/, and defaultconfigs/ together.",
    },
    {
      q: "Can I migrate a world from my Forge server?",
      a: "Usually, if the pack itself migrated: upload the world folder and set level-name in server.properties, and make sure every content mod the world depends on has a NeoForge build installed at a compatible version. Back up before the first boot — mods that changed registries between loaders can rewrite or drop blocks, and there is no way back after chunks re-save.",
    },
    {
      q: "How do version updates work?",
      a: "Minecraft version and NeoForge build are both panel variables. Pin exactly what your pack requires; when the pack updates, back up, bump the variables to match, and rerun the pack install. Worlds carry forward across Minecraft versions but never backward.",
    },
    {
      q: "How much RAM should I plan for?",
      a: "The template recommends 6 GB, which fits most current NeoForge packs at 5–10 players. RAM scales with the mod list more than the player count — a 250-mod pack can want 10 GB with three players online. The panel sets the JVM heap to your plan through user_jvm_args.txt automatically.",
    },
  ],
  relatedGames: ["minecraft-forge", "minecraft-fabric", "minecraft-paper", "minecraft"],
  searchTerms: [
    "neoforge server hosting",
    "minecraft neoforge server hosting",
    "neoforge modpack server hosting",
    "1.21 modded minecraft server",
  ],
};

export default content;
