import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "beammp",
  tagline:
    "BeamMP servers for BeamNG.drive — your maps and mods, synced crashes, no host PC required",
  heroCopy:
    "BeamMP is the multiplayer mod for BeamNG.drive, and its server is unusual in the best way: it's a lightweight relay, because the soft-body physics run on each player's machine. That means it boots in seconds and doesn't need monster hardware — what actually matters is the AuthKey (every server needs its own free key from BeamMP's Keymaster), the mods you stage for auto-download, and how many cars you let each player spawn. ReFx wires all of that into the panel: paste your key, pick a map and car limit, restart, and the config is written for you.",
  whyDedicated: [
    "BeamMP has no host-migration — when the player hosting quits, the session dies. A dedicated server keeps the freeroam running whoever comes and goes.",
    "The server auto-distributes everything in its Resources folder to joining players, so your whole group gets the same maps and car mods without anyone hand-installing zips.",
    "Car count is the real load in BeamNG multiplayer: every vehicle is a full soft-body sim on every client. A server-side MaxCars cap is the difference between a smooth cruise and a slideshow, and only the server owner controls it.",
    "A private server (hidden from the public list, join by direct connect) is how groups keep a persistent meet spot without strangers ramming the car meet.",
  ],
  recommendedSpecs: [
    {
      players: "2–8 friends",
      ram: "1 GB",
      cpu: "1 vCPU",
      storage: "5 GB SSD",
      note: "The relay itself is light — this runs a vanilla freeroam happily",
    },
    {
      players: "8–16 players",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "5 GB SSD",
      note: "The recommendation once you add custom maps and a car-mod pack",
    },
    {
      players: "16–30 players",
      ram: "4 GB",
      cpu: "2 vCPU",
      storage: "10 GB SSD",
      note: "Headroom for big mod folders and busy public-list servers",
    },
  ],
  setupSteps: [
    "Order a BeamMP server at /order — the official BeamMP-Server binary installs automatically (version pinnable in the panel; latest by default).",
    "Get your free AuthKey at keymaster.beammp.com (Discord sign-in, one key per server) and paste it into the Startup tab's BeamMP Auth Key field — players cannot join without it.",
    "Pick your settings in the Startup tab — server name, max players, cars per player, map, and public/private — then restart: ReFx writes them into ServerConfig.toml on every boot.",
    "Drop mod and map zips into Resources/Client with the file manager or SFTP; joining players download them automatically. Server-side Lua plugins go in Resources/Server.",
    "For a custom map, upload its zip to Resources/Client and set Map to the level path inside it (for example /levels/west_coast_usa/info.json), then restart.",
    "Launch BeamNG.drive through the BeamMP launcher and join from the in-game server list — or use Direct Connect with the address and port (default 30814, TCP+UDP) shown on your panel overview.",
  ],
  modSupport:
    "BeamMP mod hosting is refreshingly simple: the server is the mod distributor. Anything you place in Resources/Client — car packs, custom maps, sound mods — is pushed to every player when they join, so the whole lobby runs an identical mod set with zero manual installs. Server-side Lua plugins (chat commands, economy scripts, race timers) live in Resources/Server. Two things experienced BeamMP admins watch: total Resources size, because first-time joiners download the whole folder and a 2 GB pack means a long wait at the loading screen, and mod-map level paths, which must match the Map setting exactly or the server falls back to gridmap. There's no Steam Workshop involved — grab mods from the BeamNG repository or your usual modding sites and upload the zips as-is.",
  faq: [
    {
      q: "What is an AuthKey and do I really need one?",
      a: "Yes — every BeamMP server authenticates to the BeamMP network with its own key. They're free: sign in at keymaster.beammp.com with Discord, create a key, paste it into the panel's Startup tab, and restart. One key runs one server at a time. Without it the server process runs but nobody can join.",
    },
    {
      q: "Do my friends need to buy anything?",
      a: "They need to own BeamNG.drive; BeamMP itself is a free mod. Everyone installs the BeamMP launcher, starts the game through it, and joins your server from the in-game list or by direct connect.",
    },
    {
      q: "What port does a BeamMP server use?",
      a: "One port for everything — 30814 by default, and it needs both TCP and UDP. ReFx allocates the port automatically and writes it into ServerConfig.toml at boot; the exact address:port to share is on your panel overview.",
    },
    {
      q: "How many cars should I allow per player?",
      a: "Start at 1–2. Every spawned vehicle is a full soft-body physics simulation on every connected client, so a 10-player lobby with 3 cars each is 30 simulated vehicles on the weakest PC in the room. Raise MaxCars for small groups with strong machines; keep it low for big public servers.",
    },
    {
      q: "How do custom maps work?",
      a: "Upload the map's zip to Resources/Client, then set the Map field to the level path inside the zip — /levels/<mapname>/info.json — and restart. Players download the map automatically on join. If the path doesn't match, the server boots the default gridmap instead.",
    },
    {
      q: "Can I keep my server off the public server list?",
      a: "Yes — leave 'Hide from server list' on and the server stays private: it won't appear in the in-game browser, and friends join via Direct Connect with your address and port. Flip it off any time to go public.",
    },
    {
      q: "Which server version runs, and can I pin it?",
      a: "The panel installs the latest official BeamMP-Server release by default and lets you pin a specific version (for example v3.9.3) from the Startup tab if an update ever misbehaves with your plugins. Updating later is one click.",
    },
  ],
  relatedGames: ["american-truck-simulator", "garrys-mod", "satisfactory"],
  searchTerms: [
    "beammp server hosting",
    "beamng drive server hosting",
    "beammp dedicated server",
    "host a beammp server",
    "beamng multiplayer server hosting",
  ],
};

export default content;
