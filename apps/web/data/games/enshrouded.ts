import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "enshrouded",
  tagline: "Enshrouded server hosting with the config quirks already handled",
  heroCopy:
    "Enshrouded's dedicated server is a Windows binary with opinions: it reads everything from enshrouded_server.json, ships no Linux build (ReFx runs it cleanly under Wine, invisible to players), and quietly uses two ports where most games use one. Progression is world-bound in exactly the way that rewards a persistent server — flame altar levels, cleared shroud roots, and every voxel-carved base stay live for the whole group instead of living on one person's save. ReFx seeds the config with your name, password, slot count (16 by default), and both ports at install, so the JSON is tuned rather than written from scratch.",
  whyDedicated: [
    "Co-op progress rides on the host's save and schedule; a dedicated world lets your group dig, build, and push the shroud on their own hours.",
    "Enshrouded's voxel terrain edits and base building make saves genuinely irreplaceable — one-click and scheduled backups of the savegame folder protect months of terraforming.",
    "The server binary is a memory-resident world simulation (the template recommends 8 GB) that behaves best on dedicated RAM with restarts on a schedule, not on a host PC that also runs the client.",
    "Sixteen slots by default beats the intimacy limits of hosted co-op, and per-role passwords in the server config give you a clean way to separate friends from guests.",
  ],
  recommendedSpecs: [
    {
      players: "2–6 players",
      ram: "6 GB",
      cpu: "3 vCPU",
      storage: "10 GB SSD",
      note: "Comfortable for a small crew early in progression",
    },
    {
      players: "8–16 players",
      ram: "8 GB",
      cpu: "4 vCPU",
      storage: "10 GB SSD",
      note: "The template recommendation at the default 16-slot count",
    },
    {
      players: "16 players, large bases",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "16 GB SSD",
      note: "Headroom for heavily built worlds and long uptimes",
    },
  ],
  setupSteps: [
    "Order an Enshrouded server at /order and complete payment — SteamCMD installs the dedicated server (app 2278520) automatically, and the installer writes an enshrouded_server.json seeded with your name, password, ports, and slot count.",
    "Adjust the config in the file manager if you like: enshrouded_server.json controls the server name, password or user groups, saveDirectory (./savegame), and slotCount — edit while stopped, since the server reads it only at boot.",
    "Start the server from the panel and watch the live console as Wine brings up enshrouded_server.exe; first boot creates the world save under savegame/.",
    "Join in-game from the server browser by name, or add the address directly — Enshrouded's default game port is 15636 with the query port right above it at 15637; your allocated pair is shown in the panel.",
    "Set a backup schedule for the savegame/ directory before the group gets attached to the base, and hand a second-in-command a sub-user login for restarts.",
  ],
  modSupport:
    "Enshrouded has no official modding pipeline or workshop — no server-side mod loader exists, and community client tweaks do not translate to dedicated servers. Customization happens at the config level: slot count, role-based passwords for admin, friend, and guest groups on current server builds, and world behavior settings Keen Games has been expanding patch by patch in enshrouded_server.json. Treat the JSON as your tuning surface and keep a known-good copy in a backup; a malformed edit is the most common reason an Enshrouded server refuses to boot.",
  faq: [
    {
      q: "What ports does an Enshrouded server need?",
      a: "Two, both UDP: the game port (15636 by default) and the query port (15637) that the server browser uses. ReFx assigns and writes both into enshrouded_server.json at install — gamePort and queryPort — and the panel overview shows the pair players need.",
    },
    {
      q: "Can I move our co-op world onto the server?",
      a: "Yes. Local saves live at %USERPROFILE%\\Saved Games\\Enshrouded on the host's PC as hex-named files (with -1, -2 rollback copies). Stop the server, look in its savegame/ folder for the existing world file name (fresh installs use 3ad85aea), and upload your co-op file renamed to exactly that name via SFTP. Start the server and it loads your world; keep the original as a backup until you have verified progression.",
    },
    {
      q: "Why is my server running under Wine, and does it matter?",
      a: "Keen Games ships the dedicated server only as a Windows executable, so Linux hosts run it through the Wine compatibility layer — a standard, well-worn setup for this game. It is invisible to players and to you: same config file, same saves, same performance profile for a survival server of this size.",
    },
    {
      q: "How do passwords and roles work?",
      a: "Older server builds used a single password field, which the ReFx install seeds from your panel variable. Current server versions support user groups in enshrouded_server.json — admin, friend, and guest style roles, each with its own password and permission flags — so you can give trusted players build rights while guests explore. Edit the JSON in the file manager while the server is stopped.",
    },
    {
      q: "Does Enshrouded wipe worlds on updates?",
      a: "No — there is no wipe mechanic, and saves have carried forward through Keen's content patches, including ones that add new regions to the map. New world content generally appears in unexplored areas. Take a manual backup before major patches anyway; a pre-update snapshot costs one click and removes all drama.",
    },
    {
      q: "Is there crossplay?",
      a: "Community dedicated servers are joined from the Steam PC build — that is the supported path today. If part of your group plays elsewhere, check Keen Games' current roadmap before assuming they can join a community server; platform support has been expanding but server crossplay is a separate question from the game simply existing on a platform.",
    },
  ],
  relatedGames: ["valheim", "palworld", "v-rising", "icarus"],
  searchTerms: [
    "enshrouded server hosting",
    "enshrouded dedicated server hosting",
    "rent enshrouded server",
    "enshrouded server setup",
  ],
};

export default content;
