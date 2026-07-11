import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "abiotic-factor",
  tagline: "Abiotic Factor server hosting — keep the GATE facility persistent for a crew of scientists on mismatched schedules.",
  heroCopy:
    "Abiotic Factor is a long co-op campaign: a crew of scientists working through the GATE Cascade research facility sector by sector, with a shared base, tech benches, and gear that represent dozens of hours. That is exactly the save you do not want trapped on one person's PC — on a dedicated server the world lives server-side, your crew logs in on their own time, and the push through Manufacturing or the Far Garden keeps moving. ReFx tails AbioticFactor.log straight into the panel console, so the normally silent Windows server build is actually observable.",
  whyDedicated: [
    "Host-based co-op means the facility only exists while the host plays; a dedicated server keeps one canonical world for a crew that cannot always align schedules.",
    "World saves sit on the server where one-click backups can protect them — take one before pushing into a new sector or through an unstable portal.",
    "The default six-scientist team can grow: MaxServerPlayers is a launch flag and the template accepts up to 32.",
    "Crash auto-restart brings the facility back automatically if a long-running server process dies, before your crew notices the outage.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 scientists",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "12 GB SSD",
      note: "The standard small crew.",
    },
    {
      players: "4–6 scientists",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "12 GB SSD",
      note: "Recommended for a full default lobby with a built-out base.",
    },
    {
      players: "6–32 players",
      ram: "8 GB",
      cpu: "6 vCPU",
      storage: "20 GB SSD",
      note: "Raised MaxServerPlayers for community runs.",
    },
  ],
  setupSteps: [
    "Order Abiotic Factor at /order; a six-slot crew runs comfortably on the middle tier.",
    "Provisioning is automatic — SteamCMD installs the Windows server and it boots under Proton with your server name, password, and player cap in the launch flags.",
    "Watch the live console: ReFx streams AbioticFactor/Saved/Logs/AbioticFactor.log into it, so world load and player joins are visible in real time.",
    "Optionally upload an existing co-op world into AbioticFactor/Saved/SaveGames/Server/Worlds over SFTP before anyone joins.",
    "Connect in game via the server browser or direct IP at your-address:7777 (query 27015), entering the password you set.",
  ],
  modSupport: null,
  faq: [
    {
      q: "What port does Abiotic Factor use?",
      a: "The game port defaults to 7777/UDP with the Steam query port on 27015/UDP. Both are passed as launch flags; your server's assigned address and ports are on the panel overview.",
    },
    {
      q: "Can we move our existing co-op save to the server?",
      a: "Yes, and it works in both directions. Client worlds live at AppData/Local/AbioticFactor/Saved/SaveGames/<SteamID>/Worlds on the host PC; the dedicated server reads AbioticFactor/Saved/SaveGames/Server/Worlds. Copy the world folder across via SFTP with the server stopped.",
    },
    {
      q: "How many scientists can one server hold?",
      a: "The template defaults to 6, which matches how the facility is balanced, and MaxServerPlayers accepts up to 32. Larger lobbies work — expect more chaos in Security and scale the plan accordingly.",
    },
    {
      q: "How do I keep strangers out?",
      a: "Set the Server Password variable in the panel — it is passed to the server as a join password, and joining clients are prompted for it. Sub-user permissions let a co-op partner manage restarts without touching your billing.",
    },
    {
      q: "Do we all need to be online together?",
      a: "No. The server holds the world and each scientist's character state, so people drop in and out freely — the base, defenses, and research benches are where the group left them.",
    },
    {
      q: "How do I start a fresh facility?",
      a: "Stop the server and move or delete the world folder under AbioticFactor/Saved/SaveGames/Server/Worlds (keep a backup). A fresh world generates on the next boot.",
    },
  ],
  relatedGames: ["sons-of-the-forest", "core-keeper", "project-zomboid", "palworld"],
  searchTerms: [
    "abiotic factor server hosting",
    "abiotic factor dedicated server",
    "rent abiotic factor server",
    "abiotic factor co-op server",
  ],
};

export default content;
