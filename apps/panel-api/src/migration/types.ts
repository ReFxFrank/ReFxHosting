// ============================================================================
// Migration — Normalized Intermediate Representation (IR)
// ----------------------------------------------------------------------------
// Each MigrationSource (Pterodactyl / AMP / TCAdmin) maps its native model onto
// these source-agnostic DTOs. The ImporterService consumes ONLY this IR, so the
// loader has no knowledge of which panel the data came from.
//
// Field/enum names mirror the canonical Prisma schema in
//   database/prisma/schema.prisma
// and the mapping tables in docs/11-migration.md.
// ============================================================================

import type {
  DeployMethod,
  GlobalRole,
  VariableType,
} from '@prisma/client';

/** Stable reference back to the source row: `${source}:${kind}:${externalId}`. */
export type ExternalRef = string;

export function externalRef(
  source: string,
  kind: string,
  externalId: string | number,
): ExternalRef {
  return `${source}:${kind}:${externalId}`;
}

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

export interface NormalizedUser {
  /** Source-native primary key (e.g. Pterodactyl user id). */
  externalId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Mapped from source admin/root flags. */
  globalRole: GlobalRole;
  /** Best-effort language hint, falls back to "en". */
  locale?: string | null;
  /** True if the source marked the account verified (we still force a reset). */
  emailVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

export interface NormalizedRegion {
  /** Source location/datacenter id. */
  externalId: string;
  /** Stable, slug-like code (e.g. "eu-central"). Used as the upsert key. */
  code: string;
  name: string;
  country: string;
}

export interface NormalizedAllocation {
  externalId: string;
  ip: string;
  port: number;
  alias?: string | null;
  isPrimary: boolean;
}

export interface NormalizedNode {
  externalId: string;
  name: string;
  /** Fully-qualified domain name — the deterministic upsert key. */
  fqdn: string;
  /** External region id; resolved to a ReFx Region during load. */
  regionExternalId?: string | null;
  os: 'LINUX' | 'WINDOWS';
  daemonPort?: number | null;
  sftpPort?: number | null;
  scheme?: string | null;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  cpuOvercommit?: number | null;
  memOvercommit?: number | null;
  allocations: NormalizedAllocation[];
}

// ---------------------------------------------------------------------------
// Game definitions (Egg / Module / Game → GameTemplate)
// ---------------------------------------------------------------------------

export interface NormalizedTemplateVariable {
  envName: string;
  displayName: string;
  description?: string | null;
  type: VariableType;
  defaultValue?: string | null;
  /** Translated validation rules: { min, max, regex, options, required }. */
  rules: Record<string, unknown>;
  userEditable: boolean;
  userViewable: boolean;
  sortOrder: number;
}

/** One entry of GameTemplate.installScript (JSON array). */
export interface NormalizedInstallStep {
  container: string;
  entrypoint: string;
  script: string;
}

export interface NormalizedTemplate {
  externalId: string;
  /** Optional category grouping (Pterodactyl Nest). */
  categoryExternalId?: string | null;
  categoryName?: string | null;
  name: string;
  /** Deterministic upsert key; slugified from name + source. */
  slug: string;
  author: string;
  description?: string | null;

  deployMethods: DeployMethod[];
  supportsLinux: boolean;
  supportsWindows: boolean;

  /** tag-label -> image ref. */
  dockerImages: Record<string, string>;
  steamAppId?: number | null;

  startupCommand: string;
  startupDetect?: string | null;
  stopCommand: string;

  installScript: NormalizedInstallStep[];
  configFiles: unknown[];

  recCpuCores?: number | null;
  recMemoryMb?: number | null;
  recDiskMb?: number | null;

  variables: NormalizedTemplateVariable[];
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

export interface NormalizedServerVariable {
  envName: string;
  value: string;
}

export interface NormalizedSubUser {
  /** External user id of the subuser; resolved to a ReFx User during load. */
  userExternalId: string;
  /** Already-translated ReFx permission strings (console.command, …). */
  permissions: string[];
}

export interface NormalizedServer {
  externalId: string;
  name: string;
  description?: string | null;

  ownerExternalId: string;
  nodeExternalId: string;
  templateExternalId?: string | null;

  deployMethod: DeployMethod;
  suspended: boolean;

  cpuCores: number;
  memoryMb: number;
  swapMb: number;
  diskMb: number;
  ioWeight: number;
  slots?: number | null;

  startupCommand?: string | null;
  /** Resolved env var values (the server's `environment` JSON). */
  environment: Record<string, string>;
  dockerImage?: string | null;

  /** External allocation ids that belong to this server. */
  allocationExternalIds: string[];
  /** External allocation id of the primary, if known. */
  primaryAllocationExternalId?: string | null;

  variables: NormalizedServerVariable[];
  subUsers: NormalizedSubUser[];
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export type EntityKind =
  | 'region'
  | 'node'
  | 'allocation'
  | 'category'
  | 'template'
  | 'variable'
  | 'user'
  | 'server'
  | 'serverVariable'
  | 'subUser';

export interface EntityCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface MigrationError {
  kind: EntityKind;
  externalId?: string;
  message: string;
}

export interface MigrationWarning {
  kind: EntityKind;
  externalId?: string;
  message: string;
}

export interface MigrationReport {
  source: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt?: string;
  counts: Record<EntityKind, EntityCounts>;
  warnings: MigrationWarning[];
  errors: MigrationError[];
  /** externalRef -> new ReFx UUID, so cross-entity links resolve on re-runs. */
  idMap: Record<ExternalRef, string>;
}

export function emptyCounts(): Record<EntityKind, EntityCounts> {
  const kinds: EntityKind[] = [
    'region',
    'node',
    'allocation',
    'category',
    'template',
    'variable',
    'user',
    'server',
    'serverVariable',
    'subUser',
  ];
  const out = {} as Record<EntityKind, EntityCounts>;
  for (const k of kinds) out[k] = { created: 0, updated: 0, skipped: 0 };
  return out;
}
