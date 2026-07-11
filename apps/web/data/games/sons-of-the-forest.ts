import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "sons-of-the-forest",
  tagline: "Sons of the Forest dedicated servers — server-side saves, all three ports handled, no host required.",
  heroCopy:
    "Sons of the Forest co-op normally lives and dies with the host: the island only advances while they play, and everyone shares their save file. A dedicated server flips that model — the world lives server-side in a numbered save slot, Kelvin and Virginia keep their gear and their fates, and any of your eight players can log in whenever they like. ReFx runs the Windows server build under Proton with all three required ports (game, query, and the blob-sync save channel) allocated and reachable from first boot.",
  whyDedicated: [
    "Peer-hosted sessions stop existing when the host sleeps; a dedicated server keeps one canonical save that is never trapped on somebody's PC.",
    "Save slots are server-side — switch the SaveSlot variable to run seasons or a fresh island without anyone reinstalling or swapping files.",
    "The blob-sync port (9700) streams save data to joining clients and is exactly the port self-hosters forget to forward; ReFx opens it alongside game and query.",
    "Game mode — Peaceful through HardSurvival or Custom — is a startup variable, not a lobby setting you have to recreate every session.",
  ],
  recommendedSpecs: [
    {
      players: "1–4 players",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "25 GB SSD",
      note: "Early-island co-op with modest bases.",
    },
    {
      players: "5–8 players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "25 GB SSD",
      note: "Recommended for a full lobby and serious base construction.",
    },
    {
      players: "8 players, long-running world",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "40 GB SSD",
      note: "Headroom for sprawling late-game structures and long uptimes.",
    },
  ],
  setupSteps: [
    "Order at /order — Sons of the Forest caps at 8 players, so size for your group and pick the nearest region.",
    "After payment the panel installs the server via SteamCMD (Windows build under Proton) and creates the serverconfig folder on first launch.",
    "Set game mode, save slot, and max players as startup variables; deeper options live in serverconfig/dedicatedserver.cfg in the file manager.",
    "Start the server and wait for the console line reading Dedicated server loaded — then join from the in-game dedicated server browser, or add your-address:27016 to Steam's server favorites (game traffic runs on 8766).",
    "Schedule automatic backups — the save is small, so keep a deep history and restore after a raid on your base goes badly.",
  ],
  modSupport: null,
  faq: [
    {
      q: "Which ports does Sons of the Forest need?",
      a: "Three: the game port (default 8766/UDP), the Steam query port (default 27016/UDP), and the blob-sync port (default 9700/UDP) that streams save data to clients. ReFx allocates all three; the assigned values are on your server overview.",
    },
    {
      q: "Can we move our existing co-op save onto the server?",
      a: "Yes. Local saves live under AppData/LocalLow/Endnight/SonsOfTheForest/Saves/<SteamID>/Multiplayer on the host's PC. Upload the save folder into the server's save path under serverconfig via SFTP, point the SaveSlot variable at it, and restart. Server saves can be copied out the same way.",
    },
    {
      q: "How do game modes work on a dedicated server?",
      a: "The GameMode variable accepts Peaceful, Normal, Hard, HardSurvival, or Custom. Custom reads the fine-grained values you define in dedicatedserver.cfg, so you can mix a harsh winter with passive cannibals if that is your group's taste.",
    },
    {
      q: "Do Kelvin and Virginia persist between sessions?",
      a: "Yes — companion state is part of the world save, so the gear you hand them and any permanent deaths carry across restarts. A scheduled backup is the only way to undo losing Virginia, so keep one from before risky trips.",
    },
    {
      q: "How do I reset the island?",
      a: "Change the SaveSlot variable to an unused slot (1–10) for a fresh world while keeping the old one on disk, or delete the slot's folder under the serverconfig save path to regenerate in place.",
    },
    {
      q: "Is there crossplay?",
      a: "Sons of the Forest is a Steam PC title with no console version, so everyone joins the same build through Steam — no crossplay caveats to manage.",
    },
  ],
  relatedGames: ["the-forest", "valheim", "enshrouded", "palworld"],
  searchTerms: [
    "sons of the forest server hosting",
    "sons of the forest dedicated server",
    "rent sons of the forest server",
    "sons of the forest co-op server",
  ],
};

export default content;
