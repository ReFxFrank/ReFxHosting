import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "the-isle",
  tagline: "Evrima-branch dinosaur survival servers for rule-driven communities.",
  heroCopy:
    "The Isle's development happens on the Evrima branch — the default Steam branch still serves the abandoned Legacy build — so ReFx installs Evrima directly (-beta evrima) and you host what the community actually plays. Dino survival servers are rule-driven by nature: growth protection, no-KOS zones, and species slots are community law enforced by admins, which makes the Game.ini admin list and the join queue as important as raw player count. The server registers through Epic Online Services and appears in the in-game browser.",
  whyDedicated: [
    "Growth is measured in hours, and players will not gamble a full-grown apex on a host that disappears at bedtime — saves persist server-side and backups snapshot them.",
    "Evrima patches land often and sometimes roughly; crash auto-restart plus a restart schedule keeps the island up through it.",
    "The join queue (enabled by the template, on its own port) only manages peak hours fairly when the server is always on.",
    "Admin teams rotate — sub-user permissions give trusted staff console and file access without owner credentials.",
  ],
  recommendedSpecs: [
    {
      players: "Small pack (up to 30)",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "20 GB SSD",
    },
    {
      players: "Community server (50 players)",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "The template default and recommendation.",
    },
    {
      players: "High-population (up to 100)",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "30 GB SSD",
    },
  ],
  setupSteps: [
    "Order a The Isle server at /order; provisioning is automatic and SteamCMD installs the Evrima beta branch of app 412680.",
    "Server name, slots, password, and queue settings are seeded into TheIsle/Saved/Config/LinuxServer/Game.ini from your panel variables.",
    "Add admin SteamID64s to the AdminsSteamIDs entry — the template exposes it as a comma-separated panel variable.",
    "Review the rest of Game.ini in the file manager (dynamic weather, replays, and the queue are pre-configured) and restart to apply.",
    "Players find the server in The Isle's in-game browser; game traffic defaults to UDP 7777, with the join queue on 44000.",
  ],
  modSupport: null,
  faq: [
    {
      q: "Is this Evrima or Legacy?",
      a: "Evrima. The template pins the -beta evrima branch at install, because the default Steam branch still carries the unsupported Legacy build that active communities left behind.",
    },
    {
      q: "Which map does the server run?",
      a: "Gateway — the template sets MapName=Gateway, Evrima's current map. Earlier maps like Spiro rotated out of the active branch.",
    },
    {
      q: "What ports does The Isle use?",
      a: "UDP 7777 for game traffic by default, with the join queue on 44000 as configured by the template. Your assigned ports are shown in the panel.",
    },
    {
      q: "How do I add admins?",
      a: "List SteamID64s, comma-separated, in the AdminsSteamIDs panel variable (written into Game.ini). Admins then get access to in-game administration for enforcing server rules.",
    },
    {
      q: "Do player dinos persist?",
      a: "Yes — growth, position, and player data persist in the server's Saved directory. One-click and scheduled backups cover it, and the offsite Express add-on keeps copies off the host node.",
    },
    {
      q: "How do updates work? Evrima patches a lot.",
      a: "Re-run the install from the panel to revalidate against the latest Evrima build. Take a one-click backup first — some Evrima patches reset dino progression by design, and a snapshot gives you the choice.",
    },
    {
      q: "Can players spawn as humans?",
      a: "The template ships with humans disabled (bEnableHumans=false), matching the current state of the Evrima branch where the playable human faction is not part of the live game.",
    },
  ],
  relatedGames: ["dayz", "rust", "unturned"],
  searchTerms: [
    "the isle server hosting",
    "the isle evrima server hosting",
    "the isle dedicated server",
    "evrima server hosting",
  ],
};

export default content;
