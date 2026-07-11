import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "the-forest",
  tagline: "The Forest server hosting — one persistent peninsula that survives everyone logging off.",
  heroCopy:
    "The Forest's multiplayer is classic host-based co-op: the world exists only while the host plays, and their machine holds the only save. The dedicated server build changes the deal — a persistent peninsula with its own save slot, autosaving on a timer, that your group joins and leaves freely. It is a 2018-era engine and light on resources, so a modest plan runs it well, and config.cfg keeps every server decision (slots, difficulty, VAC, world init) in one readable file.",
  whyDedicated: [
    "Host-based co-op locks the save to one player's PC; the dedicated server owns the world, so nobody's absence blocks the group.",
    "Autosave runs server-side on serverAutoSaveInterval instead of depending on the host remembering to save at a shelter.",
    "World init is explicit — Continue resumes, New wipes — so a fresh peninsula is a deliberate choice, never an accidental overwrite.",
    "VAC and a join password are proper config.cfg entries rather than session settings that reset with each lobby.",
  ],
  recommendedSpecs: [
    {
      players: "2–4 players",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "A small group on Normal difficulty.",
    },
    {
      players: "5–8 players",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "Recommended for a full 8-slot server.",
    },
    {
      players: "8 players with large builds",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "15 GB SSD",
      note: "Extra headroom for big fort builds and busy weekends.",
    },
  ],
  setupSteps: [
    "Order The Forest at /order — it is among the lightest survival servers to run, so entry plans are a legitimate fit.",
    "Provisioning is automatic: SteamCMD installs the Windows server under Proton and writes config.cfg with your name, slots, and ports.",
    "Tune TheForestDedicatedServer_Data/forest/config/config.cfg in the file manager — difficulty, serverAutoSaveInterval, serverPassword, and the vegan/vegetarian enemy modes.",
    "Leave World init on Continue for day-to-day operation; flip it to New only when you deliberately want a fresh world, then set it back.",
    "Connect through the in-game dedicated server browser or Steam favorites at your-address:27015 (query 27016, Steam port 8766).",
  ],
  modSupport: null,
  faq: [
    {
      q: "What ports does The Forest use?",
      a: "Three UDP ports, all defined in config.cfg: the game port (default 27015), the query port (default 27016), and the Steam port (8766). ReFx writes them at install; your assigned values are on the panel overview.",
    },
    {
      q: "Where is the save, and how do I back it up?",
      a: "The server saves into a numbered slot under TheForestDedicatedServer_Data (the template pins slot 1), and players can also trigger saves at any shelter or bed. Panel backups snapshot it on your schedule, and SFTP lets you pull a copy before changing initType.",
    },
    {
      q: "Can I turn off enemies for a building-focused server?",
      a: "Yes — config.cfg supports veganMode (no enemies) and vegetarianMode (enemies only at night), plus treeRegrowMode and resetHolesMode for a tidier peninsula. These are the same toggles the game offers in single-player, enforced server-wide.",
    },
    {
      q: "How do I wipe the world?",
      a: "Set the World init variable to New and restart — the slot is regenerated and the old save is gone, so take a one-click backup first. Switch back to Continue afterward or the next restart will wipe again.",
    },
    {
      q: "Is there crossplay with consoles?",
      a: "No. The PlayStation version is a separate ecosystem; a ReFx server runs the PC (Steam) dedicated build and serves PC players only.",
    },
    {
      q: "Are there admin commands on the dedicated server?",
      a: "The Forest's dedicated build has no in-game admin console. Management happens through config.cfg (password, VAC, difficulty) and the panel — restarts, backups, and the live console cover the operational side.",
    },
  ],
  relatedGames: ["sons-of-the-forest", "valheim", "project-zomboid", "seven-days-to-die"],
  searchTerms: [
    "the forest server hosting",
    "the forest dedicated server",
    "rent the forest server",
    "the forest co-op server",
  ],
};

export default content;
