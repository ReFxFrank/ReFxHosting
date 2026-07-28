/**
 * Per-egg config-file catalog for the Config tab — which files a customer
 * edits for each game, grounded in each egg's install script and startup
 * command (generated from an audit of database/seed/templates/*.json; keep in
 * sync when egg install scripts move config paths). Files may not exist until
 * the install (or first boot) creates them — the UI handles that.
 */

export interface ConfigFileMeta {
  /** Data-dir-relative path, exact case. */
  path: string;
  label: string;
  description: string;
  format: "ini" | "properties" | "cfg" | "json" | "toml" | "yaml" | "xml" | "txt" | "lua";
  /** Whether the install script or the game's first boot creates it. */
  createdBy: "install" | "first-boot" | "unknown";
}

export interface EggConfigEntry {
  files: ConfigFileMeta[];
  /** Egg-specific caveat (panel-managed keys, reseed behavior). */
  note: string;
}

export const CONFIG_CATALOG: Record<string, EggConfigEntry> = {
  "schedule1": {
    "files": [
      {
        "path": "UserData/server_config.toml",
        "label": "Server config",
        "description": "Server name, password, [server].serverPort, [server].maxPlayers, auth and networking. serverPort here is authoritative for BOTH the gameplay UDP port and the status TCP port — the panel keeps it aligned to your allocation on every start",
        "format": "toml",
        "createdBy": "first-boot"
      },
      {
        "path": "UserData/permissions.toml",
        "label": "Permissions",
        "description": "Operator/admin lists for in-game and console commands",
        "format": "toml",
        "createdBy": "first-boot"
      },
      {
        "path": "UserData/client_mod_policy.toml",
        "label": "Client mod policy",
        "description": "Which client-side mods joining players may (or must) have",
        "format": "toml",
        "createdBy": "first-boot"
      }
    ],
    "note": "All three are generated on the server's first successful start. This is the only config the server reads (a copy at the install root is ignored). The panel re-asserts serverPort on every boot so it matches your allocated port; --max-players is passed on the command line and wins over the file. Restart to apply."
  },
  "american-truck-simulator": {
    "files": [
      {
        "path": "server_config.sii",
        "label": "Server config",
        "description": "Convoy server settings: lobby name, password, slots, ports, traffic/damage toggles.",
        "format": "cfg",
        "createdBy": "install"
      },
      {
        "path": "server_packages.sii",
        "label": "Server packages (map/DLC manifest)",
        "description": "Map/DLC package manifest exported from an ATS game client; required to boot, uploaded by the customer alongside server_packages.dat.",
        "format": "cfg",
        "createdBy": "unknown"
      }
    ],
    "note": "server_config.sii is seeded from SERVER_NAME/SERVER_PASSWORD/MAX_PLAYERS/SERVER_PORT only when the file is absent (guarded by [ ! -f ]); reinstall does NOT overwrite an existing file, but deleting it causes a reseed from panel variables on the next (re)install."
  },
  "arma-reforger": {
    "files": [
      {
        "path": "configs/server.json",
        "label": "Server config (JSON)",
        "description": "The entire Reforger server definition: name, password, scenario, players, RCON, mods. Created EMPTY at install; the customer must fill it in.",
        "format": "json",
        "createdBy": "install"
      }
    ],
    "note": "None — the file is only touch'ed when absent and never populated from panel variables (SERVER_NAME/MAX_PLAYERS/SERVER_PASSWORD/SCENARIO_ID exist as variables but the script does not write them into server.json)."
  },
  "arma3": {
    "files": [
      {
        "path": "server.cfg",
        "label": "Server config",
        "description": "Main Arma 3 server config: hostname, passwords, maxPlayers, persistence, mission rotation (class Missions).",
        "format": "cfg",
        "createdBy": "install"
      },
      {
        "path": "basic.cfg",
        "label": "Network tuning (basic.cfg)",
        "description": "Bandwidth/network performance tuning (MaxMsgSend, MinBandwidth, etc.).",
        "format": "cfg",
        "createdBy": "install"
      }
    ],
    "note": "server.cfg is seeded from SERVER_NAME/SERVER_PASSWORD/MAX_PLAYERS only when absent ([ ! -f ] guard); reinstall does not overwrite it, but deleting it reseeds from panel variables. After first install, panel variable changes do NOT reach server.cfg — the file is authoritative."
  },
  "astroneer": {
    "files": [
      {
        "path": "Astro/Saved/Config/WindowsServer/AstroServerSettings.ini",
        "label": "Server settings",
        "description": "Astroneer server settings: name, owner, password, framerate caps, PublicIP.",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "AstroServerSettings.ini is seeded from SERVER_NAME/OWNER_NAME/SERVER_PASSWORD only when absent ([ ! -f ] guard); reinstall does not overwrite, deleting it reseeds from panel variables."
  },
  "avorion": {
    "files": [
      {
        "path": "galaxy/Avorion/server.ini",
        "label": "Galaxy server.ini",
        "description": "Per-galaxy server settings the game writes on first boot (difficulty, collision, save interval, etc.).",
        "format": "ini",
        "createdBy": "first-boot"
      }
    ],
    "note": "None — the install script only runs steamcmd and stages steamclient.so. Name/players/ports are startupCommand flags (--server-name, --max-players, --port), which override the matching server.ini keys each boot."
  },
  "conan-exiles": {
    "files": [
      {
        "path": "ConanSandbox/Saved/Config/WindowsServer/ServerSettings.ini",
        "label": "ServerSettings.ini",
        "description": "Main gameplay settings: server name, admin/server password, PvP, nudity, harvest/XP rates.",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "ServerSettings.ini is seeded from SERVER_NAME/ADMIN_PASSWORD only when absent ([ ! -f ] guard); reinstall does not overwrite, deleting it reseeds from panel variables. MaxPlayers/Port/QueryPort are startupCommand args, not file keys."
  },
  "cs2": {
    "files": [
      {
        "path": "game/csgo/cfg/server.cfg",
        "label": "server.cfg",
        "description": "Auto-executed Source 2 server config: cvars, hostname, custom rules. Not created by install — the customer creates it in the seeded cfg dir.",
        "format": "cfg",
        "createdBy": "unknown"
      }
    ],
    "note": "None — no file is written from panel variables. Map, mode, GSLT, max players and RCON password are startupCommand args (+map, +game_mode, +sv_setsteamaccount, +rcon_password), which override any matching cvars in server.cfg at launch."
  },
  "dayz": {
    "files": [
      {
        "path": "serverDZ.cfg",
        "label": "Server config",
        "description": "Main DayZ server config: hostname, passwords, maxPlayers, persistence, mission (template) selection.",
        "format": "cfg",
        "createdBy": "install"
      }
    ],
    "note": "serverDZ.cfg is copied from the shipped default only when absent ([ ! -f ] guard) and is never populated from panel variables — SERVER_NAME, MAX_PLAYERS and ADMIN_PASS exist as panel variables but the script does not write them into any file; the customer must edit serverDZ.cfg (and BattlEye config) directly."
  },
  "enshrouded": {
    "files": [
      {
        "path": "enshrouded_server.json",
        "label": "Server config",
        "description": "Server name, password, ports, slot count and save/log directories.",
        "format": "json",
        "createdBy": "install"
      }
    ],
    "note": "Seeded from panel variables (SERVER_NAME, SERVER_PASSWORD, SERVER_PORT, QUERY_PORT, MAX_PLAYERS) only when the file is missing (guarded by [ ! -f ]); an existing file is preserved on reinstall, so later panel-variable changes do NOT reach it."
  },
  "factorio": {
    "files": [
      {
        "path": "data/server-settings.json",
        "label": "Server settings",
        "description": "Name, description, max players, visibility, autosave and admin settings.",
        "format": "json",
        "createdBy": "install"
      }
    ],
    "note": "The install script rewrites the .name, .description and .max_players keys of data/server-settings.json from panel variables (SERVER_NAME, SERVER_DESCRIPTION, MAX_PLAYERS) via jq on EVERY (re)install — manual edits to those three keys are overwritten; all other keys are preserved."
  },
  "fivem": {
    "files": [
      {
        "path": "server.cfg",
        "label": "Server config",
        "description": "Main FXServer config: resources to start, convars, permissions, tags.",
        "format": "cfg",
        "createdBy": "install"
      }
    ],
    "note": "server.cfg is only seeded when resources/ is missing, so edits survive reinstalls. Note sv_hostname, sv_maxClients, the licence key and endpoints are supplied as +set startup arguments from panel variables, which take precedence over values in server.cfg."
  },
  "icarus": {
    "files": [
      {
        "path": "Icarus/Saved/Config/WindowsServer/ServerSettings.ini",
        "label": "Server settings",
        "description": "Player count, session name/password, admin password and gameplay settings.",
        "format": "ini",
        "createdBy": "first-boot"
      }
    ],
    "note": ""
  },
  "minecraft-fabric": {
    "files": [
      {
        "path": "eula.txt",
        "label": "Mojang EULA",
        "description": "EULA acceptance flag (eula=true) required for the server to boot.",
        "format": "properties",
        "createdBy": "install"
      }
    ],
    "note": "eula.txt is unconditionally rewritten to eula=true from the EULA panel variable on every (re)install (no existence guard) — manual edits to it do not survive a reinstall."
  },
  "minecraft-forge": {
    "files": [
      {
        "path": "user_jvm_args.txt",
        "label": "JVM arguments",
        "description": "Extra JVM flags (GC tuning etc.); Xmx/Xms come from the panel command line.",
        "format": "txt",
        "createdBy": "install"
      },
      {
        "path": "eula.txt",
        "label": "Mojang EULA",
        "description": "EULA acceptance flag (eula=true) required for the server to boot.",
        "format": "properties",
        "createdBy": "install"
      }
    ],
    "note": "eula.txt is unconditionally rewritten to eula=true from the EULA panel variable on every (re)install. user_jvm_args.txt is seeded only if missing (edits preserved), but unix_args.txt is regenerated from the Forge installer output every (re)install — that file is launcher plumbing, not customer config."
  },
  "minecraft-neoforge": {
    "files": [
      {
        "path": "user_jvm_args.txt",
        "label": "JVM arguments",
        "description": "Extra JVM flags (GC tuning etc.); Xmx/Xms come from the panel command line.",
        "format": "txt",
        "createdBy": "install"
      },
      {
        "path": "eula.txt",
        "label": "Mojang EULA",
        "description": "EULA acceptance flag (eula=true) required for the server to boot.",
        "format": "properties",
        "createdBy": "install"
      }
    ],
    "note": "eula.txt is unconditionally rewritten to eula=true from the EULA panel variable on every (re)install. user_jvm_args.txt is seeded only if missing (edits preserved), but unix_args.txt is regenerated from the NeoForge installer output every (re)install — that file is launcher plumbing, not customer config."
  },
  "minecraft-paper": {
    "files": [
      {
        "path": "eula.txt",
        "label": "Mojang EULA acceptance",
        "description": "Single eula=true/false line required to boot the server",
        "format": "txt",
        "createdBy": "install"
      }
    ],
    "note": "eula.txt is overwritten to eula=true at every (re)install while the EULA variable is true. The server port is panel-managed via the `--port {{SERVER_PORT}}` startup flag, which overrides server-port in server.properties."
  },
  "minecraft": {
    "files": [
      {
        "path": "server.properties",
        "label": "Server config",
        "description": "Main Minecraft settings: MOTD, gamemode, difficulty, whitelist, etc. (server-port is panel-managed)",
        "format": "properties",
        "createdBy": "install"
      },
      {
        "path": "eula.txt",
        "label": "Mojang EULA acceptance",
        "description": "Single eula=true/false line required to boot the server",
        "format": "txt",
        "createdBy": "install"
      },
      {
        "path": "user_jvm_args.txt",
        "label": "Forge/NeoForge JVM args",
        "description": "Extra JVM flags — only present on Forge/NeoForge servers (heap is supplied by the panel)",
        "format": "txt",
        "createdBy": "unknown"
      }
    ],
    "note": "Every (re)install re-runs write_props(): the server-port key in server.properties is rewritten from SERVER_PORT (other keys untouched), and eula.txt is overwritten to eula=true while EULA is true."
  },
  "mordhau": {
    "files": [
      {
        "path": "Mordhau/Saved/Config/LinuxServer/Game.ini",
        "label": "Game config (Game.ini)",
        "description": "Main Mordhau server config: server name, passwords, map rotation, MaxSlots",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "Game.ini is seeded from MAX_PLAYERS only when the file is absent (first install); it is never rewritten on reinstall, so later changes to the panel Max Players variable do NOT propagate into an existing Game.ini."
  },
  "palworld-windows": {
    "files": [
      {
        "path": "Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
        "label": "Palworld settings",
        "description": "All gameplay/world settings in the single-line OptionSettings tuple; several keys are panel-managed",
        "format": "ini",
        "createdBy": "install"
      },
      {
        "path": "Pal/Saved/Config/WindowsServer/GameUserSettings.ini",
        "label": "World selection (GameUserSettings.ini)",
        "description": "DedicatedServerName pointer choosing which world under Pal/Saved/SaveGames/0 is loaded",
        "format": "ini",
        "createdBy": "install"
      },
      {
        "path": "Pal/Binaries/Win64/ue4ss/UE4SS-settings.ini",
        "label": "UE4SS mod-loader settings",
        "description": "UE4SS loader options (GraphicsAPI, caches); mods go in the sibling Mods/ folder. A generic-UE4SS fallback install puts these one level up in Win64/ instead",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "Every (re)install rewrites PalWorldSettings.ini keys ServerName, ServerPlayerMaxNum, RCONEnabled, RCONPort, PublicPort (and AdminPassword when the panel field is set) from panel variables; may rewrite DedicatedServerName in GameUserSettings.ini to point at the largest on-disk world (backing the ini up to .refxbak); and forces GraphicsAPI=dx11 / bUseUObjectArrayCache=false in UE4SS-settings.ini. (Windows egg: the ini lives under Config/WindowsServer.)"
  },
  "palworld": {
    "files": [
      {
        "path": "Pal/Saved/Config/LinuxServer/PalWorldSettings.ini",
        "label": "Palworld settings",
        "description": "All gameplay/world settings in the single-line OptionSettings tuple; several keys are panel-managed",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "Every (re)install rewrites PalWorldSettings.ini keys ServerName, ServerPlayerMaxNum, RCONEnabled, RCONPort, PublicPort (and AdminPassword when the panel field is set) from panel variables; all other keys in the ini belong to the customer. The Palworld tab offers a friendly form for PalWorldSettings.ini."
  },
  "project-zomboid": {
    "files": [
      {
        "path": "Zomboid/Server/refx.ini",
        "label": "Server config (refx preset)",
        "description": "Main PZ server settings: PublicName, MaxPlayers, ports, Mods list, PVP, etc.",
        "format": "ini",
        "createdBy": "install"
      },
      {
        "path": "Zomboid/Server/refx_SandboxVars.lua",
        "label": "Sandbox settings",
        "description": "World/sandbox tuning: zombie count, loot rarity, XP multipliers, day length",
        "format": "lua",
        "createdBy": "first-boot"
      },
      {
        "path": "ProjectZomboid64.json",
        "label": "JVM launch options",
        "description": "Game launch/JVM config; extra vmArgs can be added here (heap -Xmx is panel-managed)",
        "format": "json",
        "createdBy": "install"
      }
    ],
    "note": "Zomboid/Server/refx.ini is seeded from SERVER_NAME/MAX_PLAYERS/ports/MOD_IDS only when absent — it is NOT rewritten on reinstall (later panel-variable changes don't propagate). ProjectZomboid64.json's -Xmx IS rewritten from SERVER_MEMORY at every (re)install, and SteamCMD validate may restore other depot-shipped edits in that file."
  },
  "rust": {
    "files": [
      {
        "path": "server/rust/cfg/server.cfg",
        "label": "Server convars (server.cfg)",
        "description": "Extra server convars applied at boot (description, headerimage, url, gather rates via plugins, etc.)",
        "format": "cfg",
        "createdBy": "unknown"
      }
    ],
    "note": "No config file is rewritten at install, but the install-seeded launcher (refx-rust.sh) passes server.hostname, server.level, server.worldsize, server.seed, server.maxplayers, server.port, rcon.port and rcon.password from panel variables as +convars on every boot — those override the same keys if set in server.cfg."
  },
  "seven-days-to-die": {
    "files": [
      {
        "path": "serverconfig.xml",
        "label": "Server config",
        "description": "All 7DTD server properties: name, password, difficulty, world seed, zombie settings",
        "format": "xml",
        "createdBy": "install"
      }
    ],
    "note": "At every (re)install, serverconfig.xml's ServerName, ServerMaxPlayerCount, ServerPassword, GameDifficulty and WorldGenSeed properties are rewritten from panel variables. Additionally, `app_update 294420 validate` can restore the depot-shipped serverconfig.xml, reverting other customer edits before the panel keys are reapplied."
  },
  "sons-of-the-forest": {
    "files": [
      {
        "path": "serverconfig/dedicatedserver.cfg",
        "label": "Dedicated server config",
        "description": "JSON-formatted .cfg with server name, passwords, gameplay and custom game-mode settings",
        "format": "json",
        "createdBy": "first-boot"
      }
    ],
    "note": "The install script rewrites nothing, but the startup command passes -dedicatedserver.IpAddress/GamePort/QueryPort/BlobSyncPort/MaxPlayers/GameMode/SaveSlot from panel variables on every boot — those override the matching keys in dedicatedserver.cfg."
  },
  "soulmask": {
    "files": [
      {
        "path": "WS/Saved/Config/LinuxServer/GameUserSettings.ini",
        "label": "Game user settings",
        "description": "UE server settings persisted by the game (gameplay multipliers saved from the in-game/admin settings)",
        "format": "ini",
        "createdBy": "first-boot"
      }
    ],
    "note": "The install script rewrites no config files, but the startup command passes -SteamServerName, -Port, -QueryPort, -EchoPort and -MaxPlayers from panel variables on every boot — those take precedence over matching ini values."
  },
  "squad": {
    "files": [
      {
        "path": "SquadGame/ServerConfig/Server.cfg",
        "label": "Server config",
        "description": "Main Squad server settings (server name, tags, queue and gameplay options).",
        "format": "cfg",
        "createdBy": "install"
      },
      {
        "path": "SquadGame/ServerConfig/Rcon.cfg",
        "label": "RCON config",
        "description": "RCON password and port for remote administration.",
        "format": "cfg",
        "createdBy": "install"
      }
    ],
    "note": "On every (re)install/update the install script re-syncs the ServerName= line in SquadGame/ServerConfig/Server.cfg from the SERVER_NAME panel variable and the Password= line in SquadGame/ServerConfig/Rcon.cfg from RCON_PASS (sed replace if present, append if missing). Edits to those two keys are overwritten; all other lines in both files are preserved."
  },
  "static-nginx": {
    "files": [
      {
        "path": "nginx.conf",
        "label": "nginx config",
        "description": "Web server config: listen port, document root (public/), MIME/index rules — advanced customers can add locations, headers, redirects.",
        "format": "cfg",
        "createdBy": "install"
      },
      {
        "path": "public/index.html",
        "label": "Site homepage",
        "description": "Placeholder homepage of the hosted site; customers replace/edit the files under public/.",
        "format": "txt",
        "createdBy": "install"
      }
    ],
    "note": "nginx.conf is UNCONDITIONALLY rewritten from the egg template (interpolating ${SERVER_PORT}) on every (re)install/update — any customer edits to nginx.conf are lost. public/index.html is only seeded when missing, so site content is safe."
  },
  "team-fortress-2": {
    "files": [
      {
        "path": "tf/cfg/server.cfg",
        "label": "Server config",
        "description": "srcds convar config executed at map load (hostname, rcon_password, sv_* settings, mp_* rules).",
        "format": "cfg",
        "createdBy": "unknown"
      }
    ],
    "note": ""
  },
  "the-forest": {
    "files": [
      {
        "path": "TheForestDedicatedServer_Data/forest/config/config.cfg",
        "label": "Server config",
        "description": "The Forest dedicated server settings: name, ports, slots, VAC, difficulty, init type.",
        "format": "cfg",
        "createdBy": "install"
      }
    ],
    "note": "config.cfg is UNCONDITIONALLY rewritten on every (re)install/update from panel variables (SERVER_NAME, SERVER_PORT, QUERY_PORT, MAX_PLAYERS, INIT_TYPE) — any customer edits to it (e.g. difficulty, VAC) are lost on reinstall/update."
  },
  "the-isle": {
    "files": [
      {
        "path": "TheIsle/Saved/Config/LinuxServer/Game.ini",
        "label": "Game config",
        "description": "Main Isle (Evrima) server settings: name, slots, map, RCON, password, weather, queue, admin SteamIDs.",
        "format": "ini",
        "createdBy": "install"
      },
      {
        "path": "TheIsle/Saved/Config/LinuxServer/Engine.ini",
        "label": "Engine config",
        "description": "UE engine paths + EpicOnlineServices credentials required for server registration; rarely edited, and required for the server to list.",
        "format": "ini",
        "createdBy": "install"
      }
    ],
    "note": "Both Game.ini and Engine.ini are UNCONDITIONALLY rewritten on every (re)install/update — Game.ini from panel variables (SERVER_NAME, MAX_PLAYERS, SERVER_PASSWORD*, QUEUE_PORT, ADMIN_STEAMID) and Engine.ini from the fixed template. Customer edits to either file are lost on reinstall/update; the EOS keys in Engine.ini are also forced via -ini: startup overrides."
  },
  "tmodloader": {
    "files": [
      {
        "path": "serverconfig.txt",
        "label": "Server config",
        "description": "tModLoader server settings: maxplayers, world/worldpath, autocreate size, password, plus any extra keys (motd, modpack, etc.).",
        "format": "properties",
        "createdBy": "install"
      }
    ],
    "note": "serverconfig.txt is only seeded when missing (guarded by 'if [ ! -f ]'), so customer edits persist across reinstall/update — but changing the panel variables (MAX_PLAYERS, WORLD_NAME, etc.) after first install will NOT reach the existing file."
  },
  "unturned": {
    "files": [
      {
        "path": "Servers/refx/Server/Commands.dat",
        "label": "Startup commands",
        "description": "Per-line server commands run at boot: Name, MaxPlayers, Map, Perspective, Password, plus any others the customer adds (Cheats, Owner, PvE...).",
        "format": "txt",
        "createdBy": "install"
      }
    ],
    "note": "Commands.dat is only seeded when missing (guarded by 'if [ ! -f ]'), so customer edits persist — but panel variable changes (SERVER_NAME, MAX_PLAYERS, MAP, PERSPECTIVE, SERVER_PASSWORD) after first install will NOT reach the existing file."
  },
  "v-rising": {
    "files": [
      {
        "path": "save-data/Settings/ServerHostSettings.json",
        "label": "Host settings",
        "description": "Server name, ports, slots, password, RCON and listing settings.",
        "format": "json",
        "createdBy": "unknown"
      },
      {
        "path": "save-data/Settings/ServerGameSettings.json",
        "label": "Game settings",
        "description": "Gameplay rules: PvP/PvE mode, castle limits, loot/resource multipliers, day-night cycle.",
        "format": "json",
        "createdBy": "unknown"
      }
    ],
    "note": "startupCommand CLI flags (-serverName, -saveName, -gamePort, -queryPort, -maxConnectedUsers) come from panel variables and OVERRIDE the matching keys in ServerHostSettings.json every boot."
  }
};

/** Config files for a template slug ([] when the egg has none catalogued). */
export function configFilesFor(slug: string | undefined | null): ConfigFileMeta[] {
  return slug ? (CONFIG_CATALOG[slug]?.files ?? []) : [];
}

export function configNoteFor(slug: string | undefined | null): string {
  return slug ? (CONFIG_CATALOG[slug]?.note ?? "") : "";
}
