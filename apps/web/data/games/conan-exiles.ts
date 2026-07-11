import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "conan-exiles",
  tagline: "Conan Exiles servers with the purge, raid windows, and every ServerSettings.ini value under your control.",
  heroCopy:
    "Conan Exiles is a settings-driven game: harvest multipliers, XP curves, raid windows, and the entire purge system live in ServerSettings.ini, and the stock values fit almost no clan. A dedicated server lets you run the Exiled Lands on your rules — purge difficulty and time bands matched to when your people actually play, thrall limits and building decay set deliberately instead of left at defaults. ReFx puts that file in a web editor next to a live console, so tuning purge night never means remoting into a box.",
  whyDedicated: [
    "Co-op tethers every player to a short leash around the host; a dedicated server removes it so your clan can split across the map, from the Unnamed City to the frozen north.",
    "The purge meter and building decay only advance while the world is online — sessions that end when the host logs off stall both systems.",
    "Thrall crafting stations keep working through the night on a 24/7 server, so wheel-of-pain queues finish while everyone sleeps.",
    "You decide the mod list via modlist.txt instead of inheriting whatever the host happens to have installed.",
  ],
  recommendedSpecs: [
    {
      players: "1–10 players",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "80 GB SSD",
      note: "Vanilla Exiled Lands at default rates.",
    },
    {
      players: "10–40 players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "80 GB SSD",
      note: "The recommended baseline — headroom for purges and a few quality-of-life mods.",
    },
    {
      players: "40–70 players",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "100 GB SSD",
      note: "Large PvP communities running a full mod list.",
    },
  ],
  setupSteps: [
    "Order a Conan Exiles server at /order — pick the region closest to your clan and a plan with at least 8 GB RAM.",
    "Payment kicks off provisioning automatically: SteamCMD pulls the dedicated server (it is a large download) and the panel boots it; watch progress in the live console.",
    "Set the server name, max players, and admin password on the startup variables page — they feed ServerSettings.ini and the launch flags.",
    "Open ConanSandbox/Saved/Config/WindowsServer/ServerSettings.ini in the file manager to tune harvest rates, purge level, raid time windows, and decay.",
    "Restart from the panel, then join via the in-game server browser or direct connect to your-address:7777 (Steam query on 27015).",
    "Put a backup on a schedule and a restart shortly before your purge window — Conan servers benefit from a clean boot ahead of heavy fights.",
  ],
  modSupport:
    "Conan Exiles mods are .pak files. Upload them to ConanSandbox/Mods over SFTP or the file manager, list each file in modlist.txt in load order, and restart. Joining players need the same mods in the same order, so publish your list somewhere your community can see it, and hold updates on patch day until the mods you depend on have caught up — version mismatches kick players at the loading screen.",
  faq: [
    {
      q: "What ports does Conan Exiles use?",
      a: "Game traffic defaults to UDP 7777 (with raw UDP alongside on 7778) and the Steam query port defaults to 27015. Your server's assigned address and ports are shown on the panel overview; if the server browser is slow to refresh, direct connect works immediately.",
    },
    {
      q: "How do I become admin in game?",
      a: "Set AdminPassword in the startup variables or ServerSettings.ini, then in game open Settings, choose Server Settings, enter the password, and select Make Me Admin. The admin panel (Ctrl+Shift+C on PC) covers spawning, teleporting, and kicking.",
    },
    {
      q: "Can I move my single-player or co-op game to the server?",
      a: "Yes. The whole world — buildings, thralls, and characters — is one SQLite file, game.db, under ConanSandbox/Saved. Stop the server, upload your local game.db over SFTP to the same path, and start it again.",
    },
    {
      q: "How does the purge work on a private server?",
      a: "The purge meter fills from building and activity; once it crosses PurgeMeterTriggerValue, a purge can spawn during the time windows you configure. PurgeLevel caps how hard the waves hit, and weekday/weekend time bands in ServerSettings.ini let you make sure purges land when the clan is online to fight them.",
    },
    {
      q: "Will our buildings decay?",
      a: "By default, yes — structures lose decay time when no clan member visits and eventually become demolishable by others. Set DisableBuildingAbandonment=True for a no-decay server, or raise the decay multipliers for slower turnover on a low-population server.",
    },
    {
      q: "Is there crossplay?",
      a: "No. PC, Xbox, and PlayStation run separate server pools. A ReFx server hosts the PC (Steam) build, so only PC players can join.",
    },
    {
      q: "What if the clan moves on to another game?",
      a: "Switch the same server to a different game from the panel — the address, backups, and billing stay in place, so you are not starting a new contract to try something else.",
    },
  ],
  relatedGames: ["rust", "ark-survival-evolved", "soulmask", "v-rising"],
  searchTerms: [
    "conan exiles server hosting",
    "conan exiles dedicated server",
    "rent conan exiles server",
    "conan exiles private server",
  ],
};

export default content;
