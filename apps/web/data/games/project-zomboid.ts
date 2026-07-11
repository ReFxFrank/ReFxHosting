import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "project-zomboid",
  tagline: "Project Zomboid servers with Workshop mods from the panel and sandbox rules you actually control",
  heroCopy:
    "A Zomboid server is really three files pretending to be a game: the server .ini for identity and mod lists, SandboxVars.lua for every survival rule from zombie population to helicopter events, and a Saves folder holding the slowly deteriorating world your group refuses to abandon. ReFx provisions the dedicated server with its config preset already seeded — the panel writes your name, player cap, ports, and mod IDs into Zomboid/Server/refx.ini — and because this template supports the Steam Workshop, mods install from the panel in one click instead of a copy-paste ritual of IDs. This is how you died; make sure it was lag-free.",
  whyDedicated: [
    "Host-based co-op puts the whole world on one person's PC and connection — when they sleep, the generators stop; a dedicated server keeps the world persistent, loot respawn timers honest, and the map open around the clock.",
    "Zomboid's Java server wants a properly sized heap; the ReFx install patches the JVM's -Xmx to match your plan automatically, which home-hosted servers routinely get wrong and pay for in OOM crashes.",
    "Long-running servers accumulate an irreplaceable map state — barricades, corpses, burned blocks, player stashes. Scheduled backups of the Zomboid/ data directory make a corrupted chunk a restore instead of a season-ending event.",
    "Crash auto-restart matters in a permadeath game: a server that dies mid-horde and stays down is how groups quietly stop playing.",
  ],
  recommendedSpecs: [
    {
      players: "2–6 survivors",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "A private group with a light mod list",
    },
    {
      players: "8–16 survivors",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "12 GB SSD",
      note: "The template recommendation — the sweet spot for most communities",
    },
    {
      players: "16–32 survivors or heavy mods",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "Map mods and large populations grow both RAM and disk",
    },
  ],
  setupSteps: [
    "Order a Project Zomboid server at /order and check out — SteamCMD installs the dedicated server (app 380870) automatically after payment, and the installer seeds your server preset at Zomboid/Server/refx.ini with your name, player cap, and ports.",
    "Add mods before first boot if you want them: install Workshop mods in one click from the panel, or list IDs by hand — the panel's mod IDs variable feeds the Mods= line in refx.ini, with WorkshopItems= holding the corresponding Workshop IDs.",
    "Start the server and let the live console run through first-boot world creation, then stop it and tune Zomboid/Server/refx_SandboxVars.lua in the file manager — zombie population and lore, XP multiplier, loot rarity, water and electricity shutoff are all in there.",
    "Set an admin password via the panel variable, and use the console to manage players in-game (grantadmin, kick, ban) once you are running.",
    "Connect from Project Zomboid via Join, entering your address with the default port 16261 (UDP) — the direct-connect port 16262 should be reachable too, and both are pre-allocated and shown in the panel.",
    "Schedule backups of the Zomboid/ directory — config, saves, and player databases all live under it thanks to the server's cachedir setting, so one folder captures everything.",
  ],
  modSupport:
    "This template has full Steam Workshop support: browse and install Workshop mods in one click from the panel, and the server wires them into the Mods= and WorkshopItems= lines of refx.ini for you. Zomboid's canon stack — bigger map pieces, more vehicles, quality-of-life UI — installs this way, and joining players auto-download Workshop content on connect, so nobody manages files by hand. Two rules keep it stable: mod load order matters when frameworks are involved (map mods and their dependencies first), and every mod update on the Workshop requires a server restart to pick up, which is a natural fit for a nightly restart schedule.",
  faq: [
    {
      q: "What port does a Project Zomboid server use?",
      a: "16261 UDP is the default game port players enter on the Join screen, and 16262 UDP handles direct connections alongside it. ReFx allocates both at provisioning and passes them on the startup line (-port and -udpport), so the address on your panel overview is complete.",
    },
    {
      q: "Where is my server's config — I read guides mentioning servertest.ini?",
      a: "Same file, different preset name. Zomboid names config after the server preset, and guides assume the default preset 'servertest'. ReFx starts the server with the preset 'refx', so your files are Zomboid/Server/refx.ini, refx_SandboxVars.lua, and refx_spawnregions.lua — every servertest guide applies, just swap the name.",
    },
    {
      q: "How do I install Workshop mods?",
      a: "From the panel: this template supports one-click Steam Workshop installs, which add the mod's Workshop ID and mod ID to refx.ini for you. Manually, a mod's Workshop page URL gives you the Workshop ID for WorkshopItems= and its description lists the Mod ID for Mods= — both semicolon-separated in refx.ini. Restart after changes; clients download the mods automatically when joining.",
    },
    {
      q: "How do I move an existing world or back up my current one?",
      a: "Everything lives under the server's Zomboid/ directory: the world is Zomboid/Saves/Multiplayer/<preset>/ (map chunks plus the players database) and config sits in Zomboid/Server/. To migrate from another host or a local dedicated server, copy that Saves folder in via SFTP and rename it to match the refx preset, bringing the matching ini and SandboxVars along. Backups from the panel capture the same tree.",
    },
    {
      q: "Can I change sandbox settings after the world exists?",
      a: "Yes — edit refx_SandboxVars.lua while the server is stopped and most values apply on next boot: XP multipliers, loot rarity, zombie respawn. Population settings interact with already-spawned zombies, so drastic changes feel gradual rather than instant. World-generation choices and the starting date are the ones you cannot revisit without a fresh save.",
    },
    {
      q: "Do updates or Build 42 wipe my server?",
      a: "Zomboid saves are tied to their build: within a stable build, updates carry saves forward, but a major build jump (like Build 41 to Build 42) is a different game under the hood and generally means a new world. The Indie Stone gates multiplayer builds carefully, so run the stable branch, back up before any announced build transition, and archive the old world rather than deleting it.",
    },
    {
      q: "Is there crossplay?",
      a: "Project Zomboid is PC-only (Steam), so there is no console crossplay to plan around — everyone joins the same dedicated server from the same build of the game. The only compatibility rule is version and mod list parity between client and server.",
    },
  ],
  relatedGames: ["seven-days-to-die", "dayz", "unturned", "rust"],
  searchTerms: [
    "project zomboid server hosting",
    "project zomboid dedicated server hosting",
    "zomboid server with mods",
    "project zomboid server rental",
  ],
};

export default content;
