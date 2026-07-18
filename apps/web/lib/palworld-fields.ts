/**
 * Web-side field catalog for the Palworld settings form — labels, groups,
 * widget types and defaults. This is the display mirror of the panel-api's
 * FIELD_SPECS (apps/panel-api/src/servers/palworld-settings.util.ts), which is
 * the authority for the ini VALUE types. Keep the key/type/managed columns in
 * lock-step with that file when adding or changing a setting.
 */

export type PalWidget =
  | "string"
  | "secret"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "tuple";

export interface PalFieldMeta {
  key: string;
  label: string;
  type: PalWidget;
  /** Also written from the Startup tab — rendered read-only here. */
  managed?: boolean;
  /** Allowed tokens for enum / tuple widgets. */
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  /** Fallback shown when the key is absent from the ini (Palworld's default). */
  default?: string | number | boolean | string[];
  help?: string;
}

export interface PalGroup {
  title: string;
  description?: string;
  fields: PalFieldMeta[];
}

const f = 1; // default rate (1.000000)

export const PALWORLD_GROUPS: PalGroup[] = [
  {
    title: "Server identity",
    description:
      "Name, passwords and network. The read-only fields are set on the Startup tab and re-applied on reinstall.",
    fields: [
      { key: "ServerName", label: "Server name", type: "string", managed: true },
      {
        key: "ServerDescription",
        label: "Server description",
        type: "string",
        default: "",
      },
      {
        key: "ServerPassword",
        label: "Join password",
        type: "secret",
        help: "Leave blank for a public server (or to keep the current one).",
      },
      {
        key: "AdminPassword",
        label: "Admin password",
        type: "secret",
        managed: true,
      },
      {
        key: "ServerPlayerMaxNum",
        label: "Max players",
        type: "int",
        min: 1,
        max: 32,
        default: 16,
        managed: true,
      },
      {
        key: "PublicPort",
        label: "Public port",
        type: "int",
        min: 1,
        max: 65535,
        default: 8211,
        managed: true,
      },
      { key: "RCONEnabled", label: "Enable RCON", type: "bool", managed: true },
      {
        key: "RCONPort",
        label: "RCON port",
        type: "int",
        min: 1,
        max: 65535,
        default: 25575,
        managed: true,
      },
      { key: "RESTAPIEnabled", label: "Enable REST API", type: "bool", default: false },
      {
        key: "RESTAPIPort",
        label: "REST API port",
        type: "int",
        min: 1,
        max: 65535,
        default: 8212,
      },
      { key: "bUseAuth", label: "Require authentication", type: "bool", default: true },
      {
        key: "CrossplayPlatforms",
        label: "Crossplay platforms",
        type: "tuple",
        options: ["Steam", "Xbox", "PS5", "Mac"],
        default: ["Steam", "Xbox", "PS5", "Mac"],
      },
    ],
  },
  {
    title: "Rates",
    description: "Global multipliers. 1.0 is the vanilla rate.",
    fields: [
      { key: "DayTimeSpeedRate", label: "Day-time speed", type: "float", default: f },
      { key: "NightTimeSpeedRate", label: "Night-time speed", type: "float", default: f },
      { key: "ExpRate", label: "EXP rate", type: "float", default: f },
      { key: "PalCaptureRate", label: "Pal capture rate", type: "float", default: f },
      { key: "PalSpawnNumRate", label: "Pal spawn count", type: "float", default: f },
      { key: "WorkSpeedRate", label: "Work speed", type: "float", default: f },
      { key: "CollectionDropRate", label: "Gatherable drop rate", type: "float", default: f },
      { key: "CollectionObjectHpRate", label: "Gatherable HP", type: "float", default: f },
      {
        key: "CollectionObjectRespawnSpeedRate",
        label: "Gatherable respawn speed",
        type: "float",
        default: f,
      },
      { key: "EnemyDropItemRate", label: "Enemy drop rate", type: "float", default: f },
    ],
  },
  {
    title: "Combat & PvP",
    fields: [
      { key: "PalDamageRateAttack", label: "Pal damage dealt", type: "float", default: f },
      { key: "PalDamageRateDefense", label: "Pal damage taken", type: "float", default: f },
      { key: "PlayerDamageRateAttack", label: "Player damage dealt", type: "float", default: f },
      {
        key: "PlayerDamageRateDefense",
        label: "Player damage taken",
        type: "float",
        default: f,
      },
      {
        key: "DeathPenalty",
        label: "Death penalty",
        type: "enum",
        options: ["None", "Item", "ItemAndEquipment", "All"],
        default: "All",
      },
      { key: "bEnablePlayerToPlayerDamage", label: "Player-vs-player damage", type: "bool", default: false },
      { key: "bEnableFriendlyFire", label: "Friendly fire", type: "bool", default: false },
      { key: "bIsPvP", label: "PvP enabled", type: "bool", default: false },
      { key: "bEnableInvaderEnemy", label: "Enable raids / invaders", type: "bool", default: true },
    ],
  },
  {
    title: "Survival",
    fields: [
      {
        key: "Difficulty",
        label: "Difficulty",
        type: "enum",
        options: ["None", "Casual", "Normal", "Hard"],
        default: "None",
      },
      { key: "PlayerStomachDecreaseRate", label: "Player hunger rate", type: "float", default: f },
      { key: "PlayerStaminaDecreaseRate", label: "Player stamina drain", type: "float", default: f },
      { key: "PlayerAutoHPRegeneRate", label: "Player HP regen", type: "float", default: f },
      {
        key: "PlayerAutoHpRegeneRateInSleep",
        label: "Player HP regen (sleep)",
        type: "float",
        default: f,
      },
      { key: "bEnableFastTravel", label: "Fast travel", type: "bool", default: true },
      { key: "bEnableNonLoginPenalty", label: "Offline penalty", type: "bool", default: true },
      {
        key: "bIsStartLocationSelectByMap",
        label: "Choose start location",
        type: "bool",
        default: true,
      },
      { key: "DropItemMaxNum", label: "Max dropped items", type: "int", min: 0, max: 100000, default: 3000 },
      { key: "DropItemAliveMaxHours", label: "Dropped item lifetime (hrs)", type: "float", default: f },
    ],
  },
  {
    title: "Pals",
    fields: [
      { key: "PalStomachDecreaseRate", label: "Pal hunger rate", type: "float", default: f },
      { key: "PalStaminaDecreaseRate", label: "Pal stamina drain", type: "float", default: f },
      { key: "PalAutoHPRegeneRate", label: "Pal HP regen", type: "float", default: f },
      { key: "PalAutoHpRegeneRateInSleep", label: "Pal HP regen (in box)", type: "float", default: f },
      {
        key: "PalEggDefaultHatchingTime",
        label: "Egg hatch time (hrs)",
        type: "float",
        default: 72,
      },
    ],
  },
  {
    title: "Base & Guild",
    fields: [
      { key: "BaseCampMaxNum", label: "Max base camps", type: "int", min: 0, max: 100000, default: 128 },
      { key: "BaseCampWorkerMaxNum", label: "Max base workers (Pals)", type: "int", min: 1, max: 100, default: 15 },
      { key: "GuildPlayerMaxNum", label: "Max guild players", type: "int", min: 1, max: 100, default: 20 },
      {
        key: "bAutoResetGuildNoOnlinePlayers",
        label: "Auto-reset empty guilds",
        type: "bool",
        default: false,
      },
      {
        key: "AutoResetGuildTimeNoOnlinePlayers",
        label: "Guild reset time (hrs)",
        type: "float",
        default: 72,
      },
      {
        key: "bCanPickupOtherGuildDeathPenaltyDrop",
        label: "Loot other guilds' drops",
        type: "bool",
        default: true,
      },
      {
        key: "bEnableDefenseOtherGuildPlayer",
        label: "Base defense vs. players",
        type: "bool",
        default: false,
      },
      { key: "BuildObjectDamageRate", label: "Structure damage rate", type: "float", default: f },
      {
        key: "BuildObjectDeteriorationDamageRate",
        label: "Structure decay rate",
        type: "float",
        default: f,
      },
    ],
  },
  {
    title: "Miscellaneous",
    fields: [
      { key: "bIsMultiplay", label: "Multiplayer", type: "bool", default: false },
      { key: "CoopPlayerMaxNum", label: "Co-op players", type: "int", min: 1, max: 32, default: 4 },
      {
        key: "bExistPlayerAfterLogout",
        label: "Keep player body after logout",
        type: "bool",
        default: false,
      },
      { key: "bEnableAimAssistPad", label: "Aim assist (controller)", type: "bool", default: true },
      { key: "bEnableAimAssistKeyboard", label: "Aim assist (keyboard)", type: "bool", default: false },
      { key: "bActiveUNKO", label: "Enable UNKO", type: "bool", default: false },
      { key: "DropItemMaxNum_UNKO", label: "Max UNKO items", type: "int", min: 0, max: 100000, default: 100 },
    ],
  },
];

/** Flat list of every curated field, in group order. */
export const PALWORLD_FIELDS: PalFieldMeta[] = PALWORLD_GROUPS.flatMap(
  (g) => g.fields,
);
