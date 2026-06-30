/**
 * Per-game player caps + tier player-count clamping.
 * ---------------------------------------------------------------------------
 * Each hardware-tier card shows a "~N players" estimate (Low 10 / Mid 25 /
 * High 60). For games with a hard player ceiling (Palworld 32, Enshrouded 16,
 * Killing Floor 2 12, Valheim 10, …) the Mid/High estimate would overstate what
 * the game actually allows — e.g. a Palworld High tier reading "~60 players" on
 * a server the game caps at 32. So we clamp each tier's estimate to the game's
 * real cap.
 *
 * The cap is read from the egg's MAX_PLAYERS variable (`rules.max` — the
 * authoritative per-egg ceiling already configured on every game template), with
 * a small fallback map for games whose egg has no such variable but still cap
 * (e.g. Valheim, fixed at 10 by the game rather than a server argument).
 *
 * Shared by seed.ts (sets recommendedPlayers when first creating a tier) and
 * resync-tiers.ts (re-clamps existing tiers in place).
 */

export type VarLike = { envName: string; rules?: unknown };

/** Games with a real player ceiling but NO MAX_PLAYERS variable in their egg. */
export const PLAYER_CAP_BY_SLUG: Record<string, number> = {
  valheim: 10, // hard-capped at 10 by the game itself; not a server arg
};

// Variable names that, when present, carry the game's max-player count.
const PLAYER_VAR_NAMES = new Set([
  'MAX_PLAYERS',
  'MAXPLAYERS',
  'MAX_PLAYER',
  'SLOTS',
  'PLAYERS',
]);

/**
 * A game's real player ceiling, or `null` when it's effectively uncapped
 * (Minecraft, Rust, Terraria, …). Prefers the egg's MAX_PLAYERS `rules.max`;
 * falls back to PLAYER_CAP_BY_SLUG.
 */
export function playerCapFor(
  slug: string,
  variables: VarLike[] = [],
): number | null {
  const v = variables.find((x) => PLAYER_VAR_NAMES.has(x.envName));
  const max = (v?.rules as { max?: unknown } | null | undefined)?.max;
  if (typeof max === 'number' && Number.isFinite(max) && max > 0) return max;
  return PLAYER_CAP_BY_SLUG[slug] ?? null;
}

/** Clamp a tier's player estimate to the game's real cap (no-op if uncapped). */
export function clampPlayers(
  base: number | null,
  cap: number | null,
): number | null {
  if (base == null) return null;
  return cap == null ? base : Math.min(base, cap);
}

/** Base player estimate for a standard tier by name (Low 10 / Mid 25 / High 60). */
export function basePlayersForTier(name: string): number | null {
  const n = name.toLowerCase();
  if (n.includes('low')) return 10;
  if (n.includes('mid')) return 25;
  if (n.includes('high')) return 60;
  return null;
}
