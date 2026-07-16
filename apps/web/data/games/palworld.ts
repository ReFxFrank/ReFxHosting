import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "palworld",
  tagline: "Palworld dedicated servers with sane defaults for a game that fights its admins",
  heroCopy:
    "Palworld's dedicated server has real quirks — every world setting lives on a single OptionSettings line in PalWorldSettings.ini, co-op saves need surgery before they run on a server, and long sessions historically eat memory until the process falls over. ReFx ships the server pre-wired: server name, player slots, admin password, and RCON are panel settings written into PalWorldSettings.ini at install/reinstall (ports are allocated automatically), and crash auto-restart plus a scheduled nightly restart keep a leaky Unreal server behaving. Bases keep producing and eggs keep incubating while your group is offline, which is most of the point of hosting Palworld at all.",
  whyDedicated: [
    "Steam co-op caps at 4 players and pauses when the host quits; a dedicated server lifts the cap (16 slots by default on this template, configurable to 32) and keeps ranch production, breeding, and incubators running around the clock.",
    "Palworld's server process is famously memory-hungry as uptime grows — dedicated RAM sized to the game plus automated restarts beat hoping a host PC holds up overnight.",
    "Guild bases and raid timers are persistent-world mechanics: they only make sense on a world that exists while individual players do not.",
    "RCON on a dedicated box gives you kick, ban, broadcast, and graceful shutdowns from the panel console without joining the game first.",
  ],
  recommendedSpecs: [
    {
      players: "2–6 friends",
      ram: "8 GB",
      cpu: "3 vCPU",
      storage: "24 GB SSD",
      note: "Comfortable for a small group on the larger 1.0 map",
    },
    {
      players: "8–16 players",
      ram: "12 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "The recommendation for a standard community world since the 1.0 map expansion",
    },
    {
      players: "16–32 players",
      ram: "16–20 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
      note: "For raised slot counts and long-lived worlds with many bases",
    },
  ],
  setupSteps: [
    "Order a Palworld server at /order and check out — SteamCMD installs the dedicated server (app 2394010) automatically the moment payment completes.",
    "Set your server name, max players, and admin password as panel variables; the startup already runs the community-standard performance flags (-useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS).",
    "Tune world rules in Pal/Saved/Config/LinuxServer/PalWorldSettings.ini via the file manager — day/night speed, egg incubation, death penalty, base raid toggles all live in the OptionSettings line; keep it as one line or the server ignores it.",
    "Start the server and watch the live console; once it reports listening, join from Palworld's title screen via 'Join Multiplayer Game' using your address — the default game port is 8211 (UDP).",
    "Set a nightly restart schedule and a backup schedule in the panel; Palworld servers reward being bounced regularly, and Level.sav is not something you want only one copy of.",
    "Give a co-admin the AdminPassword in game and a scoped sub-user login in the panel so moderation does not wait on you.",
  ],
  modSupport:
    "Palworld has no official mod pipeline for dedicated servers — the modding scene is UE4SS-based and client-oriented, and almost every community server runs unmodded. The good news is that the game's personality comes from configuration: PalWorldSettings.ini exposes multipliers for XP, capture rates, incubation, raid difficulty, and PvP that reshape the game more than most mod stacks would. Edit it in the file manager, restart from the panel, and keep a backup of your known-good line.",
  faq: [
    {
      q: "What port does a Palworld server use?",
      a: "8211 UDP is the game's default, passed to PalServer via -port at startup. RCON listens separately on 25575 for admin commands. The exact address:port to paste into 'Join Multiplayer Game' is shown on your panel overview.",
    },
    {
      q: "Can I move our co-op world onto the dedicated server?",
      a: "Yes, with one caveat. Co-op saves live at %LOCALAPPDATA%\\Pal\\Saved\\SaveGames\\<your Steam ID>\\<world ID> on the host's PC; the server keeps its world under Pal/Saved/SaveGames/0/<world ID>/. Upload your world folder there via SFTP and point DedicatedServerName in Pal/Saved/Config/LinuxServer/GameUserSettings.ini at the folder name. Because the co-op host's character is stored under a special GUID, older saves need the community host-save-fix tool once, or the host logs in as a fresh character.",
    },
    {
      q: "Why do my settings changes not apply?",
      a: "Two classic traps: editing DefaultPalWorldSettings.ini (a reference file the server never reads) instead of Pal/Saved/Config/LinuxServer/PalWorldSettings.ini, or breaking the single-line OptionSettings format. Edit the live file, keep everything on one line, and restart from the panel — the console confirms the values on boot.",
    },
    {
      q: "Does Palworld support crossplay on dedicated servers?",
      a: "Steam players connect directly by IP today. Pocketpair has been extending crossplay across platforms in updates, with an opt-in crossplay platforms setting on newer server builds — but console players still cannot freely join arbitrary community servers the way Steam players can, so check current patch notes before promising Xbox friends a slot.",
    },
    {
      q: "How do I keep the server from degrading over long sessions?",
      a: "Schedule a nightly restart in the panel — Palworld's server accumulates memory over multi-day uptimes, and a clean daily bounce plus crash auto-restart keeps it stable. Pair it with a backup schedule so each day's world state (Level.sav plus the Players/ folder) is captured before the restart window.",
    },
    {
      q: "How do wipes and game updates work?",
      a: "There are no forced wipes in Palworld — worlds from recent versions carried into 1.0, and SteamCMD updates keep the server on the current build (clients and server must match to connect). Two caveats from the 1.0 release: saves from very old builds (v0.7.3 and earlier) no longer load, and UE4SS/.pak mods must be deleted (not just disabled) before updating or they can corrupt the save. Take a manual backup before big patch days; if an update misbehaves, restore and hold it until fixes land.",
    },
  ],
  relatedGames: ["valheim", "enshrouded", "ark-survival-evolved", "sons-of-the-forest"],
  searchTerms: [
    "palworld server hosting",
    "palworld dedicated server hosting",
    "rent palworld server",
    "palworld dedicated server setup",
  ],
};

export default content;
