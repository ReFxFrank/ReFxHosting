import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "squad",
  tagline: "100-player combined-arms hosting built for licensed community servers.",
  heroCopy:
    "Public Squad servers operate inside Offworld Industries' server licensing program: the license — which you apply for as the server owner — is what authorizes a fully listed community server, and OWI holds licensed operators to published admin and seeding standards. Day to day, Squad hosting is live moderation at scale: admin camera, RCON kicks and broadcasts, and a disciplined Admins.cfg are how a 100-player layer stays playable. It is also one of the heavier installs you can rent — plan on roughly 90 GB of disk before mods.",
  whyDedicated: [
    "100-player layers demand consistent server performance; dedicated RAM and burst CPU hold tick rate through vehicle-heavy engagements.",
    "Seeding is a server's life cycle — an always-on address with crash auto-restart is the difference between a seeded evening and a dead browser entry.",
    "Your admin team works through RCON on a stable endpoint; the password is seeded from the panel at install so tooling connects on day one.",
    "Sub-users give senior admins panel access to restart the server or restore a backup without holding owner credentials.",
  ],
  recommendedSpecs: [
    {
      players: "Scrims and events (up to 50)",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "90 GB SSD",
      note: "The template recommendation; the base install fills most of the disk.",
    },
    {
      players: "Community server (80 slots)",
      ram: "10 GB",
      cpu: "6 vCPU",
      storage: "100 GB SSD",
      note: "80 is the template's default slot count.",
    },
    {
      players: "Full 100 with mods",
      ram: "16 GB",
      cpu: "8 vCPU",
      storage: "120 GB SSD",
    },
  ],
  setupSteps: [
    "Order a Squad server at /order; it provisions automatically and SteamCMD pulls the roughly 90 GB dedicated server (app 403240).",
    "Your server name and RCON password are seeded from panel variables into SquadGame/ServerConfig/Server.cfg and Rcon.cfg (RCON on port 21114).",
    "Add your team to SquadGame/ServerConfig/Admins.cfg with role groups covering admin camera, kick, and ban permissions.",
    "Define the rotation in SquadGame/ServerConfig/LayerRotation.cfg — Squad rotates by layer name, not bare map.",
    "Apply to Offworld Industries for a server license if you plan a public community server; the license is granted to you as the operator.",
    "Players find the server in the in-game browser; game traffic defaults to UDP 7787 with Steam query on 27165.",
  ],
  modSupport:
    "Squad mods ship through the Steam Workshop, and a modded server advertises its mod list so joining clients download the set before entering. Keep the list lean — every mod adds to an already large install — and note that licensed servers must follow OWI's rules about what may run.",
  faq: [
    {
      q: "What ports does a Squad server use?",
      a: "Game traffic on UDP 7787 by default, Steam query on 27165, and RCON on TCP 21114 — the query and RCON defaults come straight from the template, and your exact assignments are in the panel.",
    },
    {
      q: "Do I need an OWI server license?",
      a: "Not for scrims, testing, or private communities. A fully listed public server requires applying to Offworld Industries as the operator and following their hosting rules; the license attaches to you, not to your host.",
    },
    {
      q: "How does admin camera work?",
      a: "Admin camera is granted through role groups in Admins.cfg; give your admin group the cameraman permission and admins can enter the camera in-game to observe and moderate.",
    },
    {
      q: "How do I set the map rotation?",
      a: "Edit SquadGame/ServerConfig/LayerRotation.cfg with one layer per line — for example Narva_AAS_v1 — and the server walks the list in order after each match.",
    },
    {
      q: "Why does Squad need so much disk?",
      a: "The dedicated server includes nearly all game content, so expect around 90 GB on disk before any mods. That is why Squad plans are storage-heavy compared with other shooters.",
    },
    {
      q: "Can I use third-party RCON tools?",
      a: "Yes — the RCON port and the password you set as a panel variable work with the common Squad RCON clients and moderation bots your admin team already uses.",
    },
  ],
  relatedGames: ["arma3", "arma-reforger", "insurgency-sandstorm", "mordhau"],
  searchTerms: [
    "squad server hosting",
    "squad dedicated server",
    "squad licensed server hosting",
    "squad rcon server",
  ],
};

export default content;
