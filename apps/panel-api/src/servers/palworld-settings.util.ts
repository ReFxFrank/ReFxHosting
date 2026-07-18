/**
 * Pure parse / serialize / typing helpers for Palworld's PalWorldSettings.ini.
 *
 * Palworld stores every gameplay option on a SINGLE line inside one tuple:
 *
 *   [/Script/Pal.PalGameWorldSettings]
 *   OptionSettings=(Difficulty=None,DayTimeSpeedRate=1.000000,ServerName="My Server",CrossplayPlatforms=(Steam,Xbox,PS5,Mac),...)
 *
 * The running server reads this file ONCE at boot and then owns/normalizes it,
 * so live file-manager edits are clobbered — edits must be made while stopped
 * and written atomically (that's the whole point of this panel). A stray line
 * break inside the tuple makes Palworld boot pure defaults, so we NEVER drop a
 * key and we keep the tuple strictly single-line.
 *
 * These functions are deliberately I/O-free so they can be unit-tested in
 * isolation; the service (palworld-settings.service.ts) wires them to the agent.
 */

/** A single `Key=RawValue` entry from the OptionSettings tuple. `raw` is the
 * value exactly as it sits in the file (quoted string, bare number, True/False,
 * a bare enum token, or a nested `(A,B,C)` tuple). */
export interface PalPair {
  key: string;
  raw: string;
}

/** The field's ini value type. Drives both GET decoding and PATCH encoding. */
export type PalFieldType =
  | "string"
  | "secret"
  | "int"
  | "float"
  | "bool"
  | "enum"
  | "tuple";

export interface PalFieldSpec {
  key: string;
  type: PalFieldType;
  /** Allowed bare tokens for `enum` / `tuple` types. */
  values?: readonly string[];
  /** Inclusive integer bounds (int only). */
  min?: number;
  max?: number;
  /** Panel-managed: also written from the Startup tab at install/reinstall.
   * Rendered read-only here and NEVER written by the settings PATCH so the two
   * surfaces can't silently fight over the same key. */
  managed?: boolean;
}

/** Masked view of a secret field — the value is never returned. */
export interface PalSecretView {
  set: boolean;
}

/** A decoded curated value (or null when the key is absent from the ini). */
export type PalFieldValue =
  | string
  | number
  | boolean
  | string[]
  | PalSecretView
  | null;

/** GET payload: typed curated fields + every other key round-tripped raw. */
export interface PalworldSettingsData {
  fields: Record<string, PalFieldValue>;
  extraKeys: { key: string; value: string }[];
}

// ---------------------------------------------------------------------------
// Field catalog (curated form). Grouping/labels live in the web mirror
// (apps/web/lib/palworld-fields.ts); this is the authority for TYPES so parsing,
// serialization and validation stay consistent. Keep the two in lock-step.
// ---------------------------------------------------------------------------

const CROSSPLAY = ["Steam", "Xbox", "PS5", "Mac"] as const;
const DEATH_PENALTY = ["None", "Item", "ItemAndEquipment", "All"] as const;
const DIFFICULTY = ["None", "Casual", "Normal", "Hard"] as const;

/** Every curated key, in a stable order. `managed` keys are also owned by the
 * Startup tab. */
export const FIELD_SPECS: readonly PalFieldSpec[] = [
  // ---- Server identity ----
  { key: "ServerName", type: "string", managed: true },
  { key: "ServerDescription", type: "string" },
  { key: "ServerPassword", type: "secret" },
  { key: "AdminPassword", type: "secret", managed: true },
  { key: "ServerPlayerMaxNum", type: "int", min: 1, max: 32, managed: true },
  { key: "PublicPort", type: "int", min: 1, max: 65535, managed: true },
  { key: "RCONEnabled", type: "bool", managed: true },
  { key: "RCONPort", type: "int", min: 1, max: 65535, managed: true },
  { key: "RESTAPIEnabled", type: "bool" },
  { key: "RESTAPIPort", type: "int", min: 1, max: 65535 },
  { key: "bUseAuth", type: "bool" },
  { key: "CrossplayPlatforms", type: "tuple", values: CROSSPLAY },

  // ---- Rates ----
  { key: "DayTimeSpeedRate", type: "float" },
  { key: "NightTimeSpeedRate", type: "float" },
  { key: "ExpRate", type: "float" },
  { key: "PalCaptureRate", type: "float" },
  { key: "PalSpawnNumRate", type: "float" },
  { key: "WorkSpeedRate", type: "float" },
  { key: "CollectionDropRate", type: "float" },
  { key: "CollectionObjectHpRate", type: "float" },
  { key: "CollectionObjectRespawnSpeedRate", type: "float" },
  { key: "EnemyDropItemRate", type: "float" },

  // ---- Combat / PvP ----
  { key: "PalDamageRateAttack", type: "float" },
  { key: "PalDamageRateDefense", type: "float" },
  { key: "PlayerDamageRateAttack", type: "float" },
  { key: "PlayerDamageRateDefense", type: "float" },
  { key: "DeathPenalty", type: "enum", values: DEATH_PENALTY },
  { key: "bEnablePlayerToPlayerDamage", type: "bool" },
  { key: "bEnableFriendlyFire", type: "bool" },
  { key: "bIsPvP", type: "bool" },
  { key: "bEnableInvaderEnemy", type: "bool" },

  // ---- Survival ----
  { key: "Difficulty", type: "enum", values: DIFFICULTY },
  { key: "PlayerStomachDecreaseRate", type: "float" },
  { key: "PlayerStaminaDecreaseRate", type: "float" },
  { key: "PlayerAutoHPRegeneRate", type: "float" },
  { key: "PlayerAutoHpRegeneRateInSleep", type: "float" },
  { key: "bEnableFastTravel", type: "bool" },
  { key: "bEnableNonLoginPenalty", type: "bool" },
  { key: "bIsStartLocationSelectByMap", type: "bool" },
  { key: "DropItemMaxNum", type: "int", min: 0, max: 100000 },
  { key: "DropItemAliveMaxHours", type: "float" },

  // ---- Pals ----
  { key: "PalStomachDecreaseRate", type: "float" },
  { key: "PalStaminaDecreaseRate", type: "float" },
  { key: "PalAutoHPRegeneRate", type: "float" },
  { key: "PalAutoHpRegeneRateInSleep", type: "float" },
  { key: "PalEggDefaultHatchingTime", type: "float" },

  // ---- Base / Guild ----
  { key: "BaseCampMaxNum", type: "int", min: 0, max: 100000 },
  { key: "BaseCampWorkerMaxNum", type: "int", min: 1, max: 100 },
  { key: "GuildPlayerMaxNum", type: "int", min: 1, max: 100 },
  { key: "bAutoResetGuildNoOnlinePlayers", type: "bool" },
  { key: "AutoResetGuildTimeNoOnlinePlayers", type: "float" },
  { key: "bCanPickupOtherGuildDeathPenaltyDrop", type: "bool" },
  { key: "bEnableDefenseOtherGuildPlayer", type: "bool" },
  { key: "BuildObjectDamageRate", type: "float" },
  { key: "BuildObjectDeteriorationDamageRate", type: "float" },

  // ---- Misc ----
  { key: "bIsMultiplay", type: "bool" },
  { key: "CoopPlayerMaxNum", type: "int", min: 1, max: 32 },
  { key: "bExistPlayerAfterLogout", type: "bool" },
  { key: "bEnableAimAssistPad", type: "bool" },
  { key: "bEnableAimAssistKeyboard", type: "bool" },
  { key: "bActiveUNKO", type: "bool" },
  { key: "DropItemMaxNum_UNKO", type: "int", min: 0, max: 100000 },
] as const;

const SPEC_BY_KEY = new Map<string, PalFieldSpec>(
  FIELD_SPECS.map((s) => [s.key, s]),
);

/** The panel-managed keys, exposed so the web can render them read-only. */
export const MANAGED_KEYS: string[] = FIELD_SPECS.filter((s) => s.managed).map(
  (s) => s.key,
);

// ---------------------------------------------------------------------------
// Value sanitizers — mirror the palworld.json install script (sstr/snum/sbool)
// so a panel write can never corrupt the single-line OptionSettings tuple.
// ---------------------------------------------------------------------------

/** Strip `"` and control chars (matches the egg's `tr -d '"[:cntrl:]'`). */
function sanitizeString(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? "").replace(/["\x00-\x1f\x7f]/g, "");
}

/** Keep only a bare enum/tuple token (alphanumeric + underscore). */
function sanitizeToken(v: unknown): string {
  return String(v ?? "").replace(/[^A-Za-z0-9_]/g, "");
}

function stripQuotes(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Tuple parsing / serialization
// ---------------------------------------------------------------------------

/** Split a comma-separated list at the TOP level only, respecting `"quotes"`
 * (commas inside a quoted string are literal) and nested `(parens)` (the
 * CrossplayPlatforms sub-tuple). */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      buf += c;
      continue;
    }
    if (!inQuotes) {
      if (c === "(") {
        depth++;
        buf += c;
        continue;
      }
      if (c === ")") {
        depth = Math.max(0, depth - 1);
        buf += c;
        continue;
      }
      if (c === "," && depth === 0) {
        parts.push(buf);
        buf = "";
        continue;
      }
    }
    buf += c;
  }
  parts.push(buf);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Parse a full `OptionSettings=(...)` line (or bare inner) into ordered pairs.
 * Tolerant: an absent/garbage line yields an empty list. */
export function parseOptionSettings(lineOrContent: string): PalPair[] {
  // Isolate the SINGLE physical OptionSettings line first. The `^[ \t]*` anchor
  // (with /m) skips a commented `;OptionSettings=(...)` line and any other line
  // that merely contains the substring, and a per-line (non-newline) capture
  // stops the match from running greedily to a later `)`-terminated line — both
  // of which would otherwise drop or corrupt keys (Palworld keeps the whole
  // tuple on one line; a newline inside it boots pure defaults).
  const lineMatch = lineOrContent.match(
    /^[ \t]*OptionSettings[ \t]*=[ \t]*\(.*\)[ \t]*$/m,
  );
  const line = lineMatch ? lineMatch[0] : lineOrContent;
  const m = line.match(/^[ \t]*OptionSettings[ \t]*=[ \t]*\((.*)\)[ \t]*$/);
  const inner = m ? m[1] : "";
  return splitTopLevel(inner)
    .map((seg) => {
      const eq = seg.indexOf("=");
      if (eq < 0) return { key: seg.trim(), raw: "" };
      return { key: seg.slice(0, eq).trim(), raw: seg.slice(eq + 1).trim() };
    })
    .filter((p) => /^[A-Za-z0-9_]+$/.test(p.key));
}

/** Rebuild the single-line `OptionSettings=(...)` from ordered pairs. */
export function serializeOptionSettings(pairs: PalPair[]): string {
  return `OptionSettings=(${pairs
    .map((p) => `${p.key}=${p.raw}`)
    .join(",")})`;
}

/** Replace (or insert) the OptionSettings line inside a full ini file, leaving
 * every other line — the section header and any other keys — untouched. */
export function replaceOptionSettingsLine(
  content: string,
  newLine: string,
): string {
  const optRe = /^[ \t]*OptionSettings[ \t]*=[ \t]*\(.*$/m;
  if (optRe.test(content)) return content.replace(optRe, newLine);

  const headerRe = /^\[\/Script\/Pal\.PalGameWorldSettings\][ \t]*$/m;
  if (headerRe.test(content)) {
    return content.replace(headerRe, (h) => `${h}\n${newLine}`);
  }

  const prefix = content.trim().length
    ? content.replace(/\s*$/, "") + "\n"
    : "";
  return `${prefix}[/Script/Pal.PalGameWorldSettings]\n${newLine}\n`;
}

// ---------------------------------------------------------------------------
// Decode (raw -> typed) for GET
// ---------------------------------------------------------------------------

function decodeTuple(raw: string): string[] {
  const t = raw.trim();
  const inner =
    t.startsWith("(") && t.endsWith(")") ? t.slice(1, -1) : t;
  return splitTopLevel(inner).map((tok) => stripQuotes(tok));
}

function decode(spec: PalFieldSpec, raw: string): PalFieldValue {
  switch (spec.type) {
    case "int": {
      const n = parseInt(String(raw).replace(/[^0-9-]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    case "float": {
      const n = parseFloat(String(raw));
      return Number.isFinite(n) ? n : null;
    }
    case "bool":
      return /^true$/i.test(raw.trim());
    case "enum":
      return sanitizeToken(stripQuotes(raw));
    case "tuple":
      return decodeTuple(raw);
    case "secret":
      // Secrets never round-trip their value out; handled in buildData.
      return { set: stripQuotes(raw).length > 0 };
    case "string":
    default:
      return stripQuotes(raw);
  }
}

/** Build the GET payload from parsed pairs: every curated field typed (secrets
 * masked to `{ set }`), plus every non-curated key round-tripped verbatim. */
export function buildData(pairs: PalPair[]): PalworldSettingsData {
  const map = new Map(pairs.map((p) => [p.key, p.raw]));
  const fields: Record<string, PalFieldValue> = {};
  for (const spec of FIELD_SPECS) {
    const raw = map.get(spec.key);
    if (spec.type === "secret") {
      fields[spec.key] = {
        set: raw != null && stripQuotes(raw).length > 0,
      };
      continue;
    }
    fields[spec.key] = raw == null ? null : decode(spec, raw);
  }
  const curated = new Set(FIELD_SPECS.map((s) => s.key));
  const extraKeys = pairs
    .filter((p) => !curated.has(p.key))
    .map((p) => ({ key: p.key, value: p.raw }));
  return { fields, extraKeys };
}

// ---------------------------------------------------------------------------
// Encode (typed -> raw) for PATCH
// ---------------------------------------------------------------------------

/** Thrown for an invalid submitted value; the service maps it to a 400. */
export class PalValidationError extends Error {}

function clampInt(spec: PalFieldSpec, n: number): number {
  let v = Math.trunc(n);
  if (spec.min != null) v = Math.max(spec.min, v);
  if (spec.max != null) v = Math.min(spec.max, v);
  return v;
}

/** Encode one submitted value to its raw ini form, or `null` to skip the write
 * (empty secret). Throws PalValidationError on an unusable value. */
function encode(spec: PalFieldSpec, value: unknown): string | null {
  switch (spec.type) {
    case "int": {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new PalValidationError(`${spec.key} must be a number`);
      }
      return String(clampInt(spec, n));
    }
    case "float": {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new PalValidationError(`${spec.key} must be a number`);
      }
      // Guard absurd magnitudes: toFixed only yields fixed-point below 1e21, and
      // exponential notation ("1e+21") is not the 6dp float Palworld expects.
      // Real Palworld rates/times are tiny; 1e15 is a generous ceiling.
      if (Math.abs(n) >= 1e15) {
        throw new PalValidationError(`${spec.key} is out of range`);
      }
      return n.toFixed(6);
    }
    case "bool": {
      const truthy =
        value === true ||
        value === 1 ||
        /^(1|true|yes|on)$/i.test(String(value).trim());
      return truthy ? "True" : "False";
    }
    case "enum": {
      const token = sanitizeToken(value);
      if (spec.values && !spec.values.includes(token)) {
        throw new PalValidationError(
          `${spec.key} must be one of: ${spec.values.join(", ")}`,
        );
      }
      return token;
    }
    case "tuple": {
      const arr = Array.isArray(value) ? value : [];
      const tokens: string[] = [];
      for (const item of arr) {
        const token = sanitizeToken(item);
        if (!token) continue;
        if (spec.values && !spec.values.includes(token)) {
          throw new PalValidationError(
            `${spec.key} contains an invalid value "${token}"`,
          );
        }
        if (!tokens.includes(token)) tokens.push(token);
      }
      return `(${tokens.join(",")})`;
    }
    case "secret": {
      const s = sanitizeString(value);
      // Write-only: an empty submission leaves the existing secret untouched.
      return s.length > 0 ? `"${s}"` : null;
    }
    case "string":
    default:
      return `"${sanitizeString(value)}"`;
  }
}

/**
 * Merge submitted curated fields into the parsed pairs, preserving order and
 * every untouched key. Panel-managed keys are skipped (owned by the Startup
 * tab); unknown keys are rejected; empty secrets are left as-is.
 */
export function applyUpdates(
  pairs: PalPair[],
  fields: Record<string, unknown>,
): PalPair[] {
  const result = pairs.map((p) => ({ ...p }));
  const idx = new Map(result.map((p, i) => [p.key, i]));
  for (const [key, value] of Object.entries(fields)) {
    const spec = SPEC_BY_KEY.get(key);
    if (!spec) {
      throw new PalValidationError(`Unknown Palworld setting "${key}"`);
    }
    if (spec.managed) continue; // Startup tab owns these; never fight over them.
    const encoded = encode(spec, value);
    if (encoded == null) continue; // empty secret -> leave untouched
    const at = idx.get(key);
    if (at != null) {
      result[at].raw = encoded;
    } else {
      idx.set(key, result.length);
      result.push({ key, raw: encoded });
    }
  }
  return result;
}
