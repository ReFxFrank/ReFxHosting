import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "cs2",
  tagline: "Community Counter-Strike 2 servers with subtick, RCON, and full config control.",
  heroCopy:
    "Counter-Strike 2 replaced fixed 64- and 128-tick servers with subtick updates, but server quality still decides how the game feels: unstable frame times on an oversold host read as bad hit registration no matter what the net graph says. Running your own server takes you out of Valve matchmaking entirely — your map pool, your mp_ cvars, your practice tooling, your community's rules. You supply a Game Server Login Token (GSLT) for app 730 from your own Steam account; the panel handles everything else.",
  whyDedicated: [
    "Subtick still executes on server frame time, so dedicated RAM and burst CPU keep simulation frames stable where a listen server or shared box stutters under load.",
    "Matchmaking picks maps and rules for you; a community server runs your map group, your ruleset, and a plugin stack like Metamod:Source with CounterStrikeSharp.",
    "Practice and scrims need server control: sv_cheats grenade practice, bot configs, and instant map changes are not available in Valve queues.",
    "RCON plus the live panel console let you moderate from anywhere, including the ReFx iOS app.",
  ],
  recommendedSpecs: [
    {
      players: "Scrims and practice (5v5)",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "40 GB SSD",
      note: "CS2's install is large even for a 10-slot server.",
    },
    {
      players: "Community casual (16 slots)",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "40 GB SSD",
      note: "Matches the template defaults.",
    },
    {
      players: "Plugins and 32+ slots",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "50 GB SSD",
      note: "Headroom for CounterStrikeSharp plugins and workshop maps.",
    },
  ],
  setupSteps: [
    "Order a Counter-Strike 2 server at /order; it provisions automatically after payment and SteamCMD pulls app 730 on first install.",
    "Create a GSLT for app 730 at steamcommunity.com/dev/managegameservers and paste it into the GSLT variable in the panel — Valve requires it for internet-facing servers.",
    "Set the starting map, game type, game mode, and RCON password variables; the defaults boot de_dust2 under competitive rules.",
    "Edit game/csgo/cfg/server.cfg in the file manager for hostname, mp_ overrides, and practice configs.",
    "Connect from the in-game console with connect your-address:27015 (the assigned port is on your server overview), or add it to your Steam server favorites.",
  ],
  modSupport:
    "CS2 servers run Metamod:Source and CounterStrikeSharp for admin menus, retakes, executes, and practice plugins — upload them over SFTP into game/csgo/addons. Workshop maps for app 730 install with one click from the ReFx panel, and a workshop collection can drive your entire map pool.",
  faq: [
    {
      q: "What port does a CS2 server use?",
      a: "CS2 defaults to UDP 27015 for game traffic. Your server's assigned address and port are shown in the panel and used verbatim in the connect command.",
    },
    {
      q: "Do I need a GSLT to run the server?",
      a: "Yes, for anything beyond LAN use. Generate a token for app 730 at steamcommunity.com/dev/managegameservers under your own Steam account and set it as the GSLT variable — Valve ties public server identity to that token.",
    },
    {
      q: "Can I force 128 tick?",
      a: "No. CS2 does not expose a classic tick rate cvar; subtick timestamps player inputs between simulation frames. What you control is server stability — consistent frame times matter more than the old 64 versus 128 debate.",
    },
    {
      q: "How do I install workshop maps?",
      a: "Install them with one click from the ReFx panel (CS2's workshop runs under app 730), or reference a collection in your startup configuration. Custom cfg files upload to game/csgo/cfg over SFTP.",
    },
    {
      q: "How do I get admin on my own server?",
      a: "Set the RCON password variable and use rcon from the in-game console or the panel's live console, or install an admin framework such as CounterStrikeSharp's for chat-command moderation.",
    },
    {
      q: "How does map rotation work?",
      a: "Define a map group in gamemodes_server.txt and point the server at it, or let a workshop collection drive rotation — the server can cycle through the collection automatically at match end.",
    },
    {
      q: "Can I switch this server to another game later?",
      a: "Yes. Game switching swaps the installed game while the server keeps its address, backups, and billing — useful when your community rotates titles between seasons.",
    },
  ],
  relatedGames: ["team-fortress-2", "garrys-mod", "insurgency-sandstorm", "squad"],
  searchTerms: [
    "cs2 server hosting",
    "counter-strike 2 server hosting",
    "cs2 dedicated server",
    "rent cs2 server",
    "cs2 community server",
  ],
};

export default content;
