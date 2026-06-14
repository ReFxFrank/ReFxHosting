import type {
  NormalizedNode,
  NormalizedServer,
  NormalizedTemplate,
  NormalizedUser,
} from '../types';

/**
 * A pluggable extractor for one source panel. Implementations read (never write)
 * from the source — via API or a read-only DB — and return the source-agnostic
 * normalized IR (see ../types.ts). Adding AMP/TCAdmin means adding one of these.
 *
 * Each method is independently invokable so the CLI's `--only` flag can pull a
 * subset. Nodes carry their allocations; templates carry their variables;
 * servers carry their variables, subusers and allocation references.
 */
export interface MigrationSource {
  /** Human-readable source identifier, also used to build externalRefs. */
  readonly key: string;

  fetchUsers(): Promise<NormalizedUser[]>;
  /** Nodes include nested allocations and their parent region (if any). */
  fetchNodes(): Promise<NormalizedNode[]>;
  /** Servers reference owner/node/template/allocations by external id. */
  fetchServers(): Promise<NormalizedServer[]>;
  /** Game definitions (eggs/modules/games) with their variables. */
  fetchEggs(): Promise<NormalizedTemplate[]>;
}

/** Thrown by not-yet-implemented sources (AMP, TCAdmin stubs). */
export class NotImplementedError extends Error {
  constructor(source: string, method: string) {
    super(`${source}.${method}() is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}
