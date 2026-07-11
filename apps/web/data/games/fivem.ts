import type { GameContent } from "@/lib/game-content";

const content: GameContent = {
  slug: "fivem",
  tagline: "FXServer hosting for FiveM roleplay cities — your framework, your resources, your rules.",
  heroCopy:
    "A FiveM server is a resources folder and a server.cfg full of ensure lines: frameworks like ESX and QBCore supply the jobs, inventories, and economies that define a roleplay city, and every script you add is a resource you control. FXServer will not boot without a Cfx.re license key from keymaster.fivem.net — the key is yours, registered to your Cfx.re account, and pasted into the panel once. The artifact version is pinnable, so a Cfx.re update never lands mid-season unless you choose it.",
  whyDedicated: [
    "Roleplay cities are 24/7 communities; players expect the city to be open when they log in, not when a host machine happens to be running.",
    "Resource count drives memory — an established QBCore city with MLOs and vehicle packs wants dedicated RAM, not shared-host leftovers.",
    "RP servers attract DDoS attacks around drama and events; ReFx servers sit behind DDoS protection.",
    "Sub-user permissions let your dev team edit resources and restart the server without access to your billing.",
  ],
  recommendedSpecs: [
    {
      players: "Starter city (up to 48 slots, light resources)",
      ram: "4 GB",
      cpu: "3 vCPU",
      storage: "20 GB SSD",
    },
    {
      players: "Established ESX/QBCore city",
      ram: "6 GB",
      cpu: "4 vCPU",
      storage: "30 GB SSD",
      note: "The template recommendation.",
    },
    {
      players: "Large city (64+ slots, heavy MLOs and scripts)",
      ram: "12 GB",
      cpu: "6 vCPU",
      storage: "50 GB SSD",
    },
  ],
  setupSteps: [
    "Order a FiveM server at /order; it provisions automatically after payment with the FXServer artifact plus the standard cfx-server-data resources.",
    "Generate a server license key at keymaster.fivem.net (tied to your Cfx.re account) and paste it into the License Key variable — FXServer refuses to start without one.",
    "Upload your framework and scripts into the resources directory over SFTP and add an ensure line per resource in server.cfg.",
    "If you run ESX or QBCore, point set mysql_connection_string in server.cfg at the MySQL-compatible database you run for the city — both frameworks require one.",
    "Start the server and watch the live console for resource load-order errors, then fix ordering in server.cfg (dependencies like oxmysql ensure first).",
    "Connect in FiveM via Direct Connect to your-address:30120, or find the server in the Cfx.re list once it announces.",
  ],
  modSupport:
    "Everything in FiveM is a resource. Frameworks (ESX, QBCore), MLO interiors, vehicle packs, and standalone scripts all drop into the resources folder and register with one ensure line in server.cfg — the file manager and SFTP both work for uploads. Load order matters: database connectors and shared libraries must ensure before the framework that depends on them.",
  faq: [
    {
      q: "What port does a FiveM server use?",
      a: "FXServer listens on 30120 by default, on both TCP and UDP — the template binds both endpoints to your assigned port, which is shown in the panel.",
    },
    {
      q: "Is a license key required?",
      a: "Yes. A Cfx.re server key from keymaster.fivem.net is mandatory for every FXServer. It is registered to your own Cfx.re account and set once as a panel variable.",
    },
    {
      q: "Is ESX or QBCore preinstalled?",
      a: "The template ships the standard cfx-server-data resource set; the framework is your choice. Install ESX or QBCore into resources, ensure their dependencies, and run their SQL against your database.",
    },
    {
      q: "Do I need a database?",
      a: "For framework servers, yes — ESX and QBCore persist players, jobs, and inventories in MySQL or MariaDB. Configure set mysql_connection_string in server.cfg to point at the database you operate for the city.",
    },
    {
      q: "How many player slots can I run?",
      a: "sv_maxClients is a panel variable and defaults to 48. Higher counts run through OneSync and are subject to Cfx.re's own slot policies, independent of your hosting plan.",
    },
    {
      q: "How do I update or pin the FXServer artifact?",
      a: "Set the FX Version variable to a specific artifact build number to pin it, or to latest for Cfx.re's current recommended build. Take a one-click backup, then apply the change with a reinstall from the panel.",
    },
    {
      q: "Are my scripts and resources backed up?",
      a: "One-click and scheduled backups cover the entire server directory, resources included; the offsite Express add-on keeps copies off the host node as well.",
    },
  ],
  relatedGames: ["garrys-mod", "arma3", "rust"],
  searchTerms: [
    "fivem server hosting",
    "fivem hosting",
    "gta rp server hosting",
    "qbcore server hosting",
    "esx server hosting",
  ],
};

export default content;
