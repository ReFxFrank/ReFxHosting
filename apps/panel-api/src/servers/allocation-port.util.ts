/**
 * Default public port range used for the auto-assigned primary allocation.
 * Game-agnostic: the template's startup uses {{SERVER_PORT}}, which we set to the
 * picked port, so a single range serves every game.
 */
export const PORT_RANGE_START = 25565;
export const PORT_RANGE_END = 25999;

/**
 * Pick the lowest free port in [start, end] given the set of ports already taken
 * on a node. Returns `start` as a sensible fallback when nothing is free in range
 * (the caller still guards against collisions via the unique constraint + retry).
 */
export function pickFreePort(
  takenPorts: Iterable<number>,
  start: number = PORT_RANGE_START,
  end: number = PORT_RANGE_END,
): number {
  const taken = new Set<number>(takenPorts);
  for (let port = start; port <= end; port++) {
    if (!taken.has(port)) return port;
  }
  return start;
}

/** Heuristic: does an env var name look like it carries a port value? */
export function isPortEnvName(envName: string): boolean {
  return envName.toUpperCase().includes('PORT');
}

/**
 * Branded per-server connection hostname (GPortal-style). When a node has a
 * wildcard `gameDomain` (e.g. "fra.refx.gg") and a matching `*.fra.refx.gg` DNS
 * record points at the node, each server advertises "<shortId>.<gameDomain>"
 * instead of the raw node IP. Returns null when the node has no game domain, so
 * the caller falls back to the node fqdn. The shortId is lower-cased and any
 * non-DNS-safe chars are dropped so the label is always valid.
 */
export function buildAllocationAlias(
  shortId: string,
  gameDomain: string | null | undefined,
): string | null {
  const domain = normalizeGameDomain(gameDomain) ?? '';
  if (!domain) return null;
  const label = shortId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!label) return null;
  return `${label}.${domain}`;
}

/**
 * Normalize an operator-entered game domain for storage: trim, drop a leading
 * scheme / wildcard label and surrounding dots, lower-case. Returns null for an
 * empty value so it can clear the column.
 */
export function normalizeGameDomain(
  value: string | null | undefined,
): string | null {
  const cleaned = (value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^\*\./, '')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
  return cleaned || null;
}

/**
 * Surface a server's connection address by flattening its allocations into a
 * single `primaryAllocation` (the one flagged primary, else the first). The web
 * panel renders {alias || ip}:{port} from this; without it the address never
 * shows. Shared by every endpoint that returns server rows to the panel
 * (servers list/detail, dashboard).
 */
export function withPrimaryAllocation<
  T extends { allocations?: { isPrimary: boolean }[] | null },
>(server: T) {
  const allocations = server.allocations ?? [];
  const primary =
    allocations.find((a) => a.isPrimary) ?? allocations[0] ?? null;
  return { ...server, primaryAllocation: primary };
}
