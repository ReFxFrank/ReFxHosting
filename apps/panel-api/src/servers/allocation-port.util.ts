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
