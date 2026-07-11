import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "arma3",
  tagline: "Modded Arma 3 operations with panel-managed workshop mods and signature keys.",
  heroCopy:
    "An Arma 3 server is only as good as its mission file and mod preset: the mpmissions folder and the class Missions block in server.cfg decide what actually runs, and a CBA, ACE, and RHS line-up adds tens of gigabytes that must match what your players load. AI-heavy operations are bound to a single simulation thread, which is why serious groups budget CPU for headless clients that take AI off the main process. ReFx downloads Workshop mods from the panel, exposes them as @mod folders on the -mod line, and copies their .bikey signatures into keys/ automatically.",
  whyDedicated: [
    "Multi-hour operations cannot depend on someone's desktop staying awake; persistent=1 keeps the mission running and crash auto-restart brings a failed server back.",
    "verifySignatures only protects you when the server holds the right .bikeys — handled automatically for panel-installed workshop mods.",
    "Server FPS collapses under AI load on weak shared cores; dedicated RAM with burst CPU holds simulation speed through the assault phase.",
    "Scheduled restarts between operations clear the memory Arma accumulates over long sessions.",
  ],
  recommendedSpecs: [
    {
      players: "Co-op group (10-20, light mods)",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "30 GB SSD",
      note: "Matches the template recommendation.",
    },
    {
      players: "Community ops (30-40, ACE/RHS preset)",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "60 GB SSD",
      note: "Mod sets dominate disk use.",
    },
    {
      players: "Large milsim with headless-client headroom",
      ram: "8 GB",
      cpu: "6 vCPU",
      storage: "100 GB SSD",
    },
  ],
  setupSteps: [
    "Order an Arma 3 server at /order; provisioning is automatic and SteamCMD installs the dedicated server (app 233780).",
    "Install your mod preset through the panel's workshop installer — items download server-side, appear as @ws_ folders, and their signature keys land in keys/.",
    "Upload mission .pbo files to mpmissions over SFTP and reference them in the class Missions block of server.cfg.",
    "Tune server.cfg (hostname, passwordAdmin, verifySignatures) and the bandwidth settings in basic.cfg from the file manager.",
    "Connect through the in-game server browser or Direct Connect on UDP 2302, Arma's default game port.",
  ],
  modSupport:
    "Steam Workshop mods (app 107410) install with one click from the ReFx panel: each item is downloaded server-side, lowercased for Linux, added to the -mod line as an @ws_ folder, and its .bikey is copied into keys/ so signature verification keeps working. Manually managed mods work too — upload @mod folders over SFTP and list them in the Mods variable, semicolon-separated.",
  faq: [
    {
      q: "What port does an Arma 3 server use?",
      a: "Game traffic defaults to UDP 2302, with Steam query services on the next few ports up. Direct Connect uses your-address:2302; the assigned values are on your server overview.",
    },
    {
      q: "Do players need the same mods as the server?",
      a: "Yes — Arma requires clients to load a matching mod set. Publish a launcher preset for your community and keep verifySignatures enabled so mismatched clients are kicked instead of desyncing.",
    },
    {
      q: "How do I add missions?",
      a: "Upload .pbo mission files into mpmissions and either list them under class Missions in server.cfg for automatic rotation or pick them from the mission screen while logged in as admin.",
    },
    {
      q: "What is a headless client and do I need one?",
      a: "A headless client is a second Arma process that connects to the server and takes over AI simulation, freeing the main thread. Only missions built with HC slots use one — if yours do, plan spare CPU and RAM for the extra process.",
    },
    {
      q: "How do I get in-game admin?",
      a: "Set passwordAdmin in server.cfg, then type #login followed by the password in in-game chat. From there you can change missions, kick players, and restart the mission.",
    },
    {
      q: "Does the mission state persist?",
      a: "persistent=1 keeps the mission running when the last player disconnects. Longer-term saving depends on the mission or mods you run; the server files themselves are covered by one-click and scheduled backups.",
    },
  ],
  relatedGames: ["arma-reforger", "squad", "dayz", "insurgency-sandstorm"],
  searchTerms: [
    "arma 3 server hosting",
    "arma 3 dedicated server",
    "arma 3 mod server",
    "arma 3 milsim server hosting",
  ],
};

export default content;
