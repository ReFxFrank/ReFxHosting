import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "ark-survival-evolved",
  tagline: "ARK: Survival Evolved servers that stay up for the breeding timers",
  heroCopy:
    "ARK is a game of long clocks — mating cooldowns, egg incubation, imprint windows, baby maturation — and every one of them assumes the world keeps existing while you sleep. A dedicated server is the only way tribes get that: no tether, no host, timers always ticking, with the multipliers in Game.ini and GameUserSettings.ini deciding whether a giga takes a real-world week or an evening. ReFx runs the ASE dedicated server with your map (TheIsland by default), player cap, and admin password wired in at install, and 12 GB of RAM recommended because ARK does not do small.",
  whyDedicated: [
    "Non-dedicated sessions leash every player to within a couple hundred meters of the host — the tether makes real tribe play impossible; a dedicated server removes it entirely.",
    "Breeding and imprinting are 24/7 mechanics: eggs hatch and babies starve on wall-clock time, so serious breeders need a world that never goes offline — crash auto-restart matters here more than in almost any game.",
    "ARK's Unreal server is heavyweight — a 60+ GB install and double-digit RAM at load — which is exactly what a dedicated allocation with burst CPU is for.",
    "Tribe progress (dinos, blueprints, bases) represents hundreds of hours; scheduled backups of the save directory are the difference between a corrupted .ark file and a bad afternoon.",
  ],
  recommendedSpecs: [
    {
      players: "5–15 players",
      ram: "8 GB",
      cpu: "3 vCPU",
      storage: "60 GB SSD",
      note: "A small tribe server on TheIsland with modest rates",
    },
    {
      players: "20–40 players",
      ram: "12 GB",
      cpu: "4 vCPU",
      storage: "60 GB SSD",
      note: "The template recommendation — stable for community servers",
    },
    {
      players: "50–70 players or modded",
      ram: "16 GB",
      cpu: "6 vCPU",
      storage: "80 GB SSD",
      note: "High player caps, stacked mods, or maps like Ragnarok",
    },
  ],
  setupSteps: [
    "Order an ARK: Survival Evolved server at /order and check out — SteamCMD begins pulling the dedicated server (app 376030) immediately after payment; ARK's install is one of the largest in gaming, so allow time on first provision.",
    "Pick your map as a panel variable — TheIsland is the default, and free official maps like TheCenter, Ragnarok, Valguero, and Fjordur are a one-word change — plus server name, player cap, and admin password.",
    "Dial in rates in ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini via the file manager (XP, taming, harvest multipliers), and add breeding multipliers like EggHatchSpeedMultiplier and BabyMatureSpeedMultiplier under Game.ini in the same folder.",
    "Start the server and watch the live console — ARK takes several minutes to load a map. Once up, find it under the Unofficial list in-game or add address:27015 (the query port) to Steam's server favorites; the game port itself is 7777 (UDP).",
    "Enable admin in-game with enablecheats <your admin password>, then set a backup schedule covering ShooterGame/Saved/ — the SavedArks world file plus player and tribe profiles.",
    "Bring in your tribe: share the address, and give a co-admin a panel sub-user login scoped to console and power actions for restarts during raid hours.",
  ],
  modSupport:
    "ASE's mod scene lives on the Steam Workshop (the client game, app 346110), and on a dedicated server mods install manually: upload each mod's folder and .mod file into ShooterGame/Content/Mods via SFTP — copied from a PC that subscribed to them — then list the mod IDs in ActiveMods under [ServerSettings] in GameUserSettings.ini, in the same order players should load them. Every player must subscribe to the same mods, and mismatched versions are ARK's most common failed-join cause. Stack mods (item stacking, structures like S+) are the usual starting point because they change quality of life without warping balance.",
  faq: [
    {
      q: "Which ports does an ARK server use?",
      a: "Three matter: 7777 UDP for game traffic (plus the adjacent raw socket port one above it), 27015 UDP as the Steam query port — the one you add to Steam's server favorites — and 27020 TCP for RCON. The panel shows your allocated game and query addresses; in-game direct connect uses the game port.",
    },
    {
      q: "Where does ARK keep its saves, and how do I back them up?",
      a: "The world lives at ShooterGame/Saved/SavedArks/<MapName>.ark alongside player .arkprofile and tribe .arktribe files — that whole ShooterGame/Saved/ tree is what your backup schedule should cover, and what one-click backups capture before risky changes. Restoring a save is uploading those files back and restarting.",
    },
    {
      q: "Can I move my single-player world to the server?",
      a: "Yes. Local saves sit in the game install under ShooterGame/Saved/SavedArksLocal on your PC — copy the map's .ark file (and your .arkprofile if you want your character) into the server's ShooterGame/Saved/SavedArks/ via SFTP, matching the server's map variable to the save's map. Back up the server first, and expect single-player rate settings to be replaced by the server's ini values.",
    },
    {
      q: "How do I change maps without losing everything?",
      a: "Each map saves separately, so switching the map variable from TheIsland to Ragnarok starts a fresh Ragnarok save while the TheIsland .ark file stays on disk — switch back and it is exactly as you left it. Characters, dinos, and items do not follow across maps unless servers share a cluster ID, which is a multi-server arrangement using ARK's cluster startup flags.",
    },
    {
      q: "What breeding settings should a private server change?",
      a: "The usual quartet in Game.ini: MatingIntervalMultiplier below 1 to shorten cooldowns, EggHatchSpeedMultiplier and BabyMatureSpeedMultiplier well above 1 (10x makes most raises an evening), and BabyImprintingStatScaleMultiplier if you tune cuddle intervals. On official-like rates a giga is a 10+ day commitment; your ini decides whether that is the game you are running.",
    },
    {
      q: "Is there crossplay with console or ASA?",
      a: "A Steam ASE dedicated server accepts PC players — Steam, and Epic Games Store clients if you enable the crossplay flag for Epic — but not Xbox or PlayStation, whose unofficial servers live on a separate provider system. ARK: Survival Ascended is an entirely different game with its own servers; there is no bridge between ASE and ASA worlds.",
    },
    {
      q: "Do ARK servers wipe?",
      a: "Unofficial servers never wipe unless the owner chooses to — your world persists through updates indefinitely. Self-wiping (deleting the SavedArks file for a fresh start, sometimes seasonally) is a community practice for restoring the early-game land rush; if you run seasons, take a final backup so veterans' worlds are archived rather than destroyed.",
    },
  ],
  relatedGames: ["palworld", "conan-exiles", "the-isle", "soulmask"],
  searchTerms: [
    "ark server hosting",
    "ark survival evolved server hosting",
    "ark dedicated server hosting",
    "rent ark server",
  ],
};

export default content;
