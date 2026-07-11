import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "team-fortress-2",
  tagline: "srcds hosting for the community servers that keep TF2 alive.",
  heroCopy:
    "TF2's community servers outlasted most of the games that copied it: trade maps, surf, jailbreak, MvM, and 24/7 2fort all run on the same srcds binary you get here. SourceMod on MetaMod:Source is the de facto administration standard — ranks, votes, bans, and a plugin ecosystem thousands deep — installed by dropping files into tf/addons over SFTP. Valve's casual queue exists, but the sub-communities that define TF2 live on servers like this one.",
  whyDedicated: [
    "Community identity needs a stable address — regulars, favorites lists, and server tags only work when the server is always there.",
    "SourceMod plugins (stats, map votes, donor perks) run server-side only; casual matchmaking gives you none of it.",
    "A 24-slot all-talk server is a social space; crash auto-restart and scheduled restarts keep it open without babysitting.",
    "SourceTV on its own port lets you record and spectate matches for events and demo reviews.",
  ],
  recommendedSpecs: [
    {
      players: "Small community (12-16 slots)",
      ram: "2 GB",
      cpu: "2 vCPU",
      storage: "25 GB SSD",
      note: "The template recommendation — TF2 is light by modern standards.",
    },
    {
      players: "24-32 slots with SourceMod",
      ram: "3 GB",
      cpu: "2 vCPU",
      storage: "25 GB SSD",
    },
    {
      players: "Event servers (up to 100 slots)",
      ram: "4 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "The template allows up to 100 players for special events.",
    },
  ],
  setupSteps: [
    "Order a Team Fortress 2 server at /order; provisioning runs automatically and SteamCMD installs app 232250.",
    "Add a GSLT for app 232250 (created under your Steam account) to the panel variable for a persistent public listing.",
    "Edit tf/cfg/server.cfg in the file manager — hostname, sv_pure, alltalk, and round limits — and list your maps in tf/cfg/mapcycle.txt.",
    "Install MetaMod:Source and SourceMod into tf/ over SFTP if you want in-game admin, votes, and plugins.",
    "Connect with connect your-address:27015 from the console, or via the server browser; SourceTV listens on 27020.",
  ],
  modSupport:
    "SourceMod and MetaMod:Source cover admin, economy, and gameplay plugins; upload them to tf/addons and manage configs under tf/cfg/sourcemod. Custom maps go in tf/maps — TF2 can also pull Steam Workshop maps by ID with tf_workshop_map_sync, and large legacy content can still be served through a sv_downloadurl FastDL if you keep one.",
  faq: [
    {
      q: "What ports does a TF2 server use?",
      a: "UDP 27015 for game traffic and 27020 for SourceTV by default; your exact assigned ports are shown in the panel.",
    },
    {
      q: "Do I need a Game Server Login Token?",
      a: "For a reliable public listing, yes — create a GSLT for app 232250 under your Steam account and set it in the panel. The token identifies your server to Steam across restarts.",
    },
    {
      q: "How do I install SourceMod?",
      a: "Extract MetaMod:Source and SourceMod into the tf directory over SFTP, restart, then add your SteamID to addons/sourcemod/configs/admins_simple.ini for in-game admin.",
    },
    {
      q: "How does map rotation work?",
      a: "List maps in tf/cfg/mapcycle.txt and control changeovers with mp_timelimit and mp_maxrounds in server.cfg; SourceMod adds nextmap voting on top.",
    },
    {
      q: "Can I run custom or workshop maps?",
      a: "Yes. Workshop maps load by ID through TF2's workshop support, and classic custom maps upload to tf/maps. Anything not on the workshop downloads faster for clients if you also run a FastDL URL.",
    },
    {
      q: "Can this server run Mann vs Machine?",
      a: "Yes — load any mvm_ map and the mode runs server-side. Six player slots is the standard MvM setup, so no plan change is needed.",
    },
  ],
  relatedGames: ["cs2", "garrys-mod", "killing-floor-2"],
  searchTerms: [
    "tf2 server hosting",
    "team fortress 2 server hosting",
    "tf2 dedicated server",
    "tf2 community server",
    "sourcemod server hosting",
  ],
};

export default content;
