import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "satisfactory",
  tagline: "Satisfactory dedicated servers — the factory keeps its state even when nobody is on shift",
  heroCopy:
    "A Satisfactory dedicated server changes the shape of the game: the session lives on the server, anyone drops in without waiting for a host, and the in-game Server Manager handles saves, settings, and even uploading your existing single-player factory. The server autosaves on a rolling schedule and by default pauses the simulation when the last engineer disconnects — so belts and power stay exactly as you left them, and you decide whether an empty factory should keep producing. ReFx provisions the server with your port, player cap, and branch (early access or experimental) as panel variables, backed by 8 GB of RAM because factories only grow.",
  whyDedicated: [
    "In peer-hosted sessions the world exists only while the host plays; a dedicated server makes the factory the group's shared property, joinable at any hour without coordinating calendars.",
    "Late-game factories are memory monsters — tens of thousands of machines, belts, and items in flight — and RAM use grows with the save, which is what a dedicated allocation with room to upgrade is for.",
    "Rolling autosaves plus panel backup schedules mean a bad train-network refactor or an accidental nuclear meltdown is a restore, not a restart of a 300-hour save.",
    "Crash auto-restart keeps the session available; with the server's own autosave-on-disconnect, a mid-session drop costs minutes, not progress.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 engineers, early game",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "15 GB SSD",
      note: "Plenty through coal power and early manufacturing",
    },
    {
      players: "4 engineers, mid-to-late game",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "20 GB SSD",
      note: "The template recommendation — the default 4-player session at scale",
    },
    {
      players: "Raised player caps or megafactories",
      ram: "16 GB",
      cpu: "6 vCPU",
      storage: "30 GB SSD",
      note: "For raised MaxPlayers and saves deep into nuclear-era sprawl",
    },
  ],
  setupSteps: [
    "Order a Satisfactory server at /order and complete checkout — SteamCMD installs the dedicated server (app 1690800) automatically after payment; flip the experimental variable if your group plays the experimental branch.",
    "Start the server and let the live console confirm it is listening — a fresh server idles waiting to be claimed, which is normal.",
    "Claim it in-game: open Server Manager from Satisfactory's main menu, add your server address — the game's default port is 7777 — set the admin password, and create a session or upload an existing save.",
    "Configure from the same screen: session name, autosave interval, pause-when-empty, and auto-load session live in the Server Manager, while raising the player cap is the max players panel variable (4 by default).",
    "Set a panel backup schedule to snapshot the server's save directory alongside the game's own rolling autosaves, then hand teammates the address — they join via Server Manager too, no session invite needed.",
  ],
  modSupport:
    "Satisfactory modding runs through the Satisfactory Mod Manager and ficsit.app, and dedicated servers are supported: server-affecting mods must be installed on both the server and every client at matching versions, with the Satisfactory Mod Loader (SML) underneath. On the server side that means deploying the mod files into FactoryGame's mod directory over SFTP (SMM can target a server install to prepare them). Pin your mod list before inviting the group — mod version mismatches are the most common failed-join in modded Satisfactory — and back up before mod updates, since factories built with modded machines need those mods present to load.",
  faq: [
    {
      q: "What port does a Satisfactory server use?",
      a: "7777 is the game's default, and since the 1.0 server rewrite it carries everything — game traffic and the HTTPS API the Server Manager talks to — over TCP and UDP on that one number. ReFx assigns your port at provisioning and passes it on the startup line; the panel overview shows the exact address:port for the Server Manager's add-server dialog.",
    },
    {
      q: "Can I upload our existing single-player save?",
      a: "Yes, from inside the game: Server Manager, then Manage Saves, then Upload lets you push a local save straight to the server and set it as the active session. Local saves live at %LOCALAPPDATA%\\FactoryGame\\Saved\\SaveGames\\<your ID> if you want to copy the .sav by hand instead — server-side, saves land under .config/Epic/FactoryGame/Saved/SaveGames/server/ in your file manager, which is also what panel backups capture.",
    },
    {
      q: "Does the factory keep running when everyone logs off?",
      a: "By default, no — the server pauses the simulation when empty, so power, belts, and inventories freeze in place until someone reconnects. If you want production to continue unattended, disable pause-when-empty in the Server Manager settings; just size fuel and resource buffers accordingly, because a blackout at 4 a.m. with nobody online is now possible.",
    },
    {
      q: "How do autosaves and restores work?",
      a: "The server keeps rolling autosaves on an interval you set in Server Manager (with a save also written when players disconnect), and you can trigger manual saves any time. Panel backups snapshot the whole save directory on your schedule; to roll back, restore a backup or pick an older session save in Manage Saves. Before any big rebuild — train networks especially — take a named manual save.",
    },
    {
      q: "Can I raise the player cap above 4?",
      a: "Yes — max players is a panel variable passed to the server at startup, and groups commonly run 6–8 on a well-provisioned server. Satisfactory's simulation cost scales with the factory more than the head count, but more engineers building simultaneously does accelerate how fast the save grows, so pair a higher cap with the larger RAM tier.",
    },
    {
      q: "Steam and Epic in one session — does crossplay work?",
      a: "Yes for PC: the dedicated server accepts Steam and Epic Games Store clients in the same session, since it authenticates players independently of storefront. Everyone needs the same game version and branch (early access versus experimental), which is the usual culprit when one person cannot join.",
    },
    {
      q: "What is the experimental branch toggle for?",
      a: "Coffee Stain ships upcoming features to the experimental branch first, and clients on experimental cannot join an early-access server (or vice versa). The panel variable switches which branch SteamCMD installs, so your server tracks whichever your group plays. Back up before switching branches — saves generally move forward to experimental cleanly, but not backward.",
    },
  ],
  relatedGames: ["factorio", "astroneer", "core-keeper", "abiotic-factor"],
  searchTerms: [
    "satisfactory server hosting",
    "satisfactory dedicated server hosting",
    "rent satisfactory server",
    "satisfactory dedicated server setup",
  ],
};

export default content;
