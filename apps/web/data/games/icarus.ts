import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "icarus",
  tagline: "Icarus dedicated servers that keep your prospect loaded — drop in and out without a host online.",
  heroCopy:
    "Icarus is organized around prospects — time-boxed mission drops and persistent Open World sessions — and a dedicated server keeps exactly one loaded and joinable around the clock. Your crew's meta-progression (character XP, workshop unlocks) stays on their own accounts, while the terrain you deform, the bases you raise, and mission state live server-side in the prospect save. ReFx runs the Windows server under Proton with ServerSettings.ini exposed in the file manager, so ResumeProspect, join passwords, and the player cap are one edit away.",
  whyDedicated: [
    "Prospect sessions normally require the host online; a dedicated server keeps the drop zone live so teammates in other time zones can mine exotics without you.",
    "Open World is built to be a base you return to — on a dedicated server it is simply always there, with no re-hosting and no save-file pass-around.",
    "Standard co-op tops out at 8 players; the dedicated build reads MaxPlayers from ServerSettings.ini, so larger crews are practical.",
    "Prospect saves are compact JSON — scheduled backups give you rollback points before a deep-cavern mission goes wrong.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 prospectors",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "25 GB SSD",
      note: "Mission prospects and small outposts.",
    },
    {
      players: "5–8 prospectors",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "Recommended for full co-op and Open World.",
    },
    {
      players: "8+ on a large Open World",
      ram: "8 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
      note: "Raised MaxPlayers and heavily built-out bases.",
    },
  ],
  setupSteps: [
    "Order Icarus at /order and pick the region nearest your crew.",
    "Provisioning starts on payment — SteamCMD pulls the server and the panel boots it; the console prints an engine-initialization line when the world is up.",
    "After first boot, open Icarus/Saved/Config/WindowsServer/ServerSettings.ini in the file manager to set MaxPlayers, JoinPassword, and AdminPassword.",
    "Launch or resume your prospect from in game, selecting your server by the name you set — with a JoinPassword so strangers cannot fill your drop.",
    "Connect on your-address:17777 (Steam query on 27015) and put the Prospects folder on a backup schedule before ambitious expeditions.",
  ],
  modSupport: null,
  faq: [
    {
      q: "What ports does Icarus use?",
      a: "The game listens on UDP 17777 by default and the Steam query port defaults to 27015. Both are set on the launch command; your assigned values are shown on the panel overview.",
    },
    {
      q: "What is the difference between a prospect and Open World?",
      a: "Prospects are session-based drops — missions with objectives and, in some cases, timers — while Open World is a persistent sandbox on the same terrain. A dedicated server hosts either; you switch by changing which prospect the server loads or resumes in ServerSettings.ini.",
    },
    {
      q: "Where are the saves, and can I import our co-op prospect?",
      a: "Dedicated prospect saves are JSON files under Icarus/Saved/PlayerData/DedicatedServer/Prospects. Local co-op prospects live at AppData/Local/Icarus/Saved/PlayerData/<SteamID>/Prospects on the host PC — upload one via SFTP into the server path and resume it from the menu.",
    },
    {
      q: "Do we lose character progression if the server wipes?",
      a: "No. Character XP, talents, and workshop purchases are account-side and never stored on the server — only the prospect (terrain, buildings, mission state) is. Deleting a prospect resets the world, not your characters.",
    },
    {
      q: "How many players can join?",
      a: "The template defaults to 8, matching standard co-op, and the MaxPlayers setting accepts up to 20. Raise it in ServerSettings.ini after first boot, and scale RAM with your ambitions — more players means more loaded terrain.",
    },
    {
      q: "How do admin controls work?",
      a: "Set AdminPassword in ServerSettings.ini; authenticated players can then run administrative chat commands in game. Day-to-day operations — restarts, backups, config edits — happen from the ReFx panel and its live console.",
    },
  ],
  relatedGames: ["valheim", "abiotic-factor", "palworld", "enshrouded"],
  searchTerms: [
    "icarus server hosting",
    "icarus dedicated server",
    "icarus open world server",
    "rent icarus server",
  ],
};

export default content;
