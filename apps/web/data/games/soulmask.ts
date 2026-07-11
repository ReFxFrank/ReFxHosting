import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "soulmask",
  tagline: "Soulmask server hosting sized for tribes — NPCs keep farming, smelting, and standing guard while you sleep.",
  heroCopy:
    "Soulmask is less about one character than about the tribe you assemble: recruited tribesmen carry individual proficiencies and keep working their assigned jobs — smelting, farming, patrol routes — for as long as the world is running. A 24/7 dedicated server is therefore the difference between a base that produces overnight and one frozen in time. ReFx runs the native Linux build with world autosaves every 10 minutes baked into the launch flags, a TCP admin console on its own port, and 12 GB of dedicated RAM in the recommended tier, because a big jungle map simulating dozens of NPCs genuinely needs it.",
  whyDedicated: [
    "Tribesman automation only runs while the world does — offline production is the core reason to host Soulmask on a dedicated server.",
    "Client-hosted co-op limits your tribe's scale; the dedicated build defaults to 40 slots and the template accepts up to 70.",
    "NPC schedules, barbarian camps, and wildlife make the world sim CPU-heavy; dedicated RAM plus burst CPU keeps mask-fight hitching down.",
    "The echo port (a plain TCP console) gives you out-of-game admin access that most self-hosted setups never wire up.",
  ],
  recommendedSpecs: [
    {
      players: "1–10 players",
      ram: "8 GB",
      cpu: "3 vCPU",
      storage: "20 GB SSD",
      note: "A single tribe with a modest NPC roster.",
    },
    {
      players: "10–40 players",
      ram: "12 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "Recommended — multiple tribes with full NPC automation.",
    },
    {
      players: "40–70 players",
      ram: "16 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
      note: "Large PvP communities across the full map.",
    },
  ],
  setupSteps: [
    "Order Soulmask at /order — take the 12 GB tier or better if you intend to run real tribe automation.",
    "Provisioning is hands-off after payment: the panel installs the native Linux server via SteamCMD and boots it. When the console prints Create Dungeon Successed, the world is live.",
    "Set the server name and player cap as startup variables; engine-level overrides go under WS/Saved/Config/LinuxServer in the file manager.",
    "Connect from the in-game server list by searching your server name, or direct to your-address:8777 (Steam query on 27015).",
    "For out-of-game administration, connect to the echo port (18888/TCP) — a raw TCP maintenance console — and put daily backups on a panel schedule.",
  ],
  modSupport: null,
  faq: [
    {
      q: "What ports does Soulmask use?",
      a: "Three: the game port (default 8777/UDP), the Steam query port (default 27015/UDP), and the echo port (default 18888/TCP), which is a maintenance console. ReFx allocates and displays all of them on the server overview.",
    },
    {
      q: "How often does the world save?",
      a: "The launch flags bake in an autosave every 600 seconds plus periodic on-disk backups, and ReFx one-click and scheduled backups snapshot the whole server on top of that. Between the two, a bad raid or a corrupt save costs you minutes, not days.",
    },
    {
      q: "Can I move a co-op world onto the server?",
      a: "Yes — client-hosted and dedicated Soulmask share the WS/Saved directory layout. Stop the server, upload your local WS/Saved world data over SFTP into the same path, and start it back up. Take a panel backup first in case of version drift.",
    },
    {
      q: "Do tribesmen really keep working with nobody online?",
      a: "Yes, as long as the server is running: assigned NPCs continue crafting queues, tend crops, and hold guard posts. That is the mechanic that makes always-on hosting matter more in Soulmask than in most survival games.",
    },
    {
      q: "How many players should I plan for?",
      a: "The template defaults to 40 slots and accepts up to 70. NPC count matters as much as player count for load — a 20-player server where every tribe runs a full roster of tribesmen works the CPU harder than a 40-player server of nomads.",
    },
    {
      q: "Is there console crossplay?",
      a: "No. Soulmask's dedicated server serves the PC (Steam) build only.",
    },
  ],
  relatedGames: ["conan-exiles", "palworld", "ark-survival-evolved", "v-rising"],
  searchTerms: [
    "soulmask server hosting",
    "soulmask dedicated server",
    "rent soulmask server",
    "soulmask tribe server",
  ],
};

export default content;
