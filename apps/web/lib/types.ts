// Shared API types for the ReFx web panel.
// These mirror the canonical Prisma schema (database/prisma/schema.prisma) but
// only the fields the panel consumes over REST. In production these would be
// generated from the OpenAPI spec in packages/shared.
// TODO(impl): replace hand-written types with generated @refx/shared client.

export type GlobalRole = "CUSTOMER" | "SUPPORT" | "ADMIN" | "OWNER";
export type UserState =
  "ACTIVE" | "SUSPENDED" | "BANNED" | "PENDING_VERIFICATION";

export interface User {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  globalRole: GlobalRole;
  state: UserState;
  locale: string;
  timezone: string;
  avatarUrl: string | null;
  totpEnabledAt: string | null;
  /** True when an admin set a temporary password — forces a change on next login. */
  mustChangePassword?: boolean;
  // Contact / billing address (self-service, optional).
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  /** Store/account credit balance in minor units (cents). */
  creditBalanceMinor?: number;
  /** Effective admin permissions (present on /auth/me; gates the admin UI). */
  permissions?: string[];
  roleId?: string | null;
  createdAt: string;
}

export type CreditReason =
  "ADMIN_GRANT" | "REFUND" | "GIFT_CARD" | "INVOICE_PAYMENT" | "ADJUSTMENT";

export interface CreditTransaction {
  id: string;
  userId: string;
  amountMinor: number;
  reason: CreditReason;
  note: string | null;
  invoiceId: string | null;
  actorId: string | null;
  createdAt: string;
}

export interface CreditLedger {
  balanceMinor: number;
  transactions: CreditTransaction[];
}

/** A registered passkey (WebAuthn credential) shown in account security. */
export interface WebAuthnCredential {
  id: string;
  label: string | null;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AdminRole {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  _count?: { users: number };
}

/** Editable contact/address profile fields. */
export type ProfileUpdate = Partial<
  Pick<
    User,
    | "firstName"
    | "lastName"
    | "locale"
    | "timezone"
    | "avatarUrl"
    | "phone"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "region"
    | "postalCode"
    | "country"
  >
>;

export type ServerState =
  | "INSTALLING"
  | "OFFLINE"
  | "STARTING"
  | "RUNNING"
  | "STOPPING"
  | "CRASHED"
  | "SUSPENDED"
  | "REINSTALLING"
  | "SWITCHING_GAME"
  | "TRANSFERRING"
  | "PENDING_PAYMENT";

export type PowerSignal = "start" | "stop" | "restart" | "kill";

/**
 * Voice (e.g. TeamSpeak) vs game server. Set once at creation and immutable —
 * the authoritative discriminator the UI uses to keep voice servers separate.
 */
export type ServerType = "GAME_SERVER" | "VOICE_SERVER" | "WEB_APP";

/** A custom domain mapped to a web-app server (with its SSL/issuance state). */
export interface WebDomain {
  id: string;
  serverId: string;
  hostname: string;
  isPrimary: boolean;
  sslStatus: "PENDING" | "ACTIVE" | "FAILED";
  verifiedAt: string | null;
  createdAt: string;
}

/** True for a voice server, by the authoritative serverType discriminator. */
export function isVoiceServer(
  server?: { serverType?: ServerType | null } | null,
): boolean {
  return server?.serverType === "VOICE_SERVER";
}

export interface Server {
  id: string;
  shortId: string;
  name: string;
  description: string | null;
  ownerId: string;
  nodeId: string;
  node?: Pick<Node, "id" | "name" | "fqdn" | "regionId">;
  templateId: string | null;
  template?: Pick<
    GameTemplate,
    "id" | "name" | "slug" | "supportsWorkshop" | "workshopAppId"
  > | null;
  templateVersion: number | null;
  state: ServerState;
  deployMethod: DeployMethod;
  serverType: ServerType;
  cpuCores: number;
  memoryMb: number;
  swapMb: number;
  diskMb: number;
  slots: number | null;
  bandwidthMbps: number | null;
  startupCommand: string | null;
  dockerImage: string | null;
  environment?: Record<string, string> | null;
  subscriptionId: string | null;
  suspendedAt: string | null;
  primaryAllocation?: Allocation | null;
  createdAt: string;
  /**
   * The caller's effective per-server permissions (present on the server detail
   * response). Owners and staff receive the full catalog; a sub-user receives
   * their granted set expanded from wildcards, plus the implicit `server.read`.
   * The UI gates tabs and per-action buttons against this list.
   */
  viewerPermissions?: string[];
}

/** Server shape returned by the admin list (adds the owner relation). */
export interface AdminServer extends Server {
  owner?: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
}

/** Lifecycle of an admin-initiated server transfer between nodes. */
export type TransferState =
  | "PENDING"
  | "SNAPSHOTTING"
  | "PROVISIONING"
  | "RESTORING"
  | "FINALIZING"
  | "SUCCEEDED"
  | "FAILED";

/** A record of moving a server from one node to another (admin node transfer). */
export interface ServerTransfer {
  id: string;
  serverId: string;
  fromNodeId: string;
  toNodeId: string;
  backupId: string | null;
  state: TransferState;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Minimal customer reference embedded in admin billing rows. */
export type AdminUserRef = Pick<
  User,
  "id" | "email" | "firstName" | "lastName"
>;

export type PaymentState = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

export interface AdminInvoice extends Invoice {
  user?: AdminUserRef;
}

export interface AdminSubscription {
  id: string;
  state: SubscriptionState;
  interval: BillingInterval;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  gateway: string;
  createdAt: string;
  product?: { id: string; name: string; type: string };
  user?: AdminUserRef;
  _count?: { servers: number };
}

export interface AdminPayment {
  id: string;
  gateway: string;
  amountMinor: number;
  currency: string;
  state: PaymentState;
  failureReason: string | null;
  createdAt: string;
  invoice?: { id: string; number: string; user?: AdminUserRef };
}

export interface AdminBillingSummary {
  currency: string;
  revenueMinor: number;
  outstandingMinor: number;
  activeSubscriptions: number;
  openInvoices: number;
  paidInvoices: number;
}

export interface GatewayStatus {
  stripe: { configured: boolean; publishableKey: string | null };
  paypal: { configured: boolean };
}

/** Masked, editable gateway config for the owner Payments editor. */
export interface GatewayConfigDetail {
  stripe: {
    configured: boolean;
    secretKeyMasked: string;
    webhookSecretSet: boolean;
    publishableKey: string;
    statementDescriptor: string;
  };
  paypal: {
    configured: boolean;
    clientId: string;
    clientSecretSet: boolean;
    mode: string;
    webhookId: string;
  };
}

/** Masked SMTP/email settings for the owner editor. */
export interface EmailConfigDetail {
  configured: boolean;
  host: string;
  port: number;
  user: string;
  from: string;
  secure: boolean;
  theme: "dark" | "light";
  passwordSet: boolean;
}

/** Full account view for the admin user-detail page. */
export interface AdminUserDetail extends User {
  ownedServers?: Array<
    Pick<Server, "id" | "shortId" | "name" | "state"> & {
      node?: { name: string };
    }
  >;
  subscriptions?: AdminSubscription[];
  invoices?: AdminInvoice[];
  paymentMethods?: {
    id: string;
    gateway: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
  }[];
  _count?: { ownedServers: number; subscriptions: number; tickets: number };
}

/** A paying customer row (ACTIVE + PAID services) for the admin Customers table. */
export interface AdminCustomer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  state: UserState;
  globalRole: GlobalRole;
  createdAt: string;
  activeServices: number;
  servers: number;
  lifetimeSpendMinor: number;
}

export interface ServerStat {
  cpuPct: number;
  memUsedMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  players: number | null;
  recordedAt: string;
}

export type DeployMethod =
  "DOCKER" | "NATIVE_PROCESS" | "WINDOWS_CONTAINER" | "SANDBOX";

export interface Allocation {
  id: string;
  ip: string;
  port: number;
  alias: string | null;
  isPrimary: boolean;
}

export type NodeState =
  "PROVISIONING" | "ONLINE" | "OFFLINE" | "MAINTENANCE" | "DEGRADED";
export type NodeOs = "LINUX" | "WINDOWS";

export interface Region {
  id: string;
  code: string;
  name: string;
  country: string;
}

export interface Node {
  id: string;
  name: string;
  fqdn: string;
  scheme?: string;
  daemonPort?: number;
  sftpPort?: number;
  /** SHA-256 of the pinned agent TLS cert (present once pinned). */
  agentCertSha256?: string | null;
  regionId: string;
  region?: { id: string; code: string; name: string; country?: string | null };
  os: NodeOs;
  state: NodeState;
  maintenance: boolean;
  agentVersion: string | null;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  /** Oversell ratios: schedulable capacity = advertised × overcommit. */
  cpuOvercommit?: number;
  memOvercommit?: number;
  /** Public port range the panel auto-assigns to servers on this node. */
  allocationPortStart?: number;
  allocationPortEnd?: number;
  /** Optional wildcard game domain for branded per-server addresses. */
  gameDomain?: string | null;
  /** Whether this node can host web servers (runs Caddy on :80/:443). */
  supportsWeb?: boolean;
  /** What this node costs you per month, in minor units (cents). Null = untracked. */
  monthlyCostMinor?: number | null;
  /** ISO currency of monthlyCostMinor. */
  costCurrency?: string;
  /** Free-text provider/box label, e.g. "OVH Rise-3 · Hillsboro". */
  provider?: string | null;
  servers?: number;
  /** Most-recent heartbeat for live gauges (null until the agent reports). */
  latestHeartbeat?: NodeHeartbeat | null;
  createdAt: string;
}

/** One node's row in the economics/margin view (GET /nodes/economics). */
export interface NodeEconomicsRow {
  id: string;
  name: string;
  provider: string | null;
  region?: { code: string; name: string; country?: string | null } | null;
  monthlyCostMinor: number | null;
  costCurrency: string;
  monthlyRevenueMinorEstimated: number;
  /** revenue − cost; null when no cost is set for the node. */
  marginMinor: number | null;
  /** revenue ≥ cost; null when no cost is set. */
  profitable: boolean | null;
  serverCount: number;
  paidServerCount: number;
  allocated: { cpuCores: number; memoryMb: number; diskMb: number };
  capacity: { cpuCores: number; memoryMb: number; diskMb: number };
  /** What you actually earn per allocated GB of RAM, in minor units. */
  effectivePerGbMinor: number | null;
  /** GB of RAM you'd need allocated (at the current rate) to cover cost. */
  breakEvenMemGb: number | null;
}

/** Portfolio economics across all nodes. */
export interface NodeEconomics {
  currency: string;
  totals: {
    monthlyCostMinor: number;
    monthlyRevenueMinorEstimated: number;
    marginMinor: number;
    nodeCount: number;
    nodesWithCost: number;
  };
  nodes: NodeEconomicsRow[];
}

export interface NodeHeartbeat {
  cpuPct: number;
  memUsedMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  containers: number;
  recordedAt: string;
}

/** Panel -> agent round-trip latency probe result. */
export interface NodePing {
  ms: number | null;
  reachable: boolean;
  /** Age of the latest heartbeat (agent → panel), or null if none yet. */
  heartbeatAgeMs?: number | null;
}

export interface GameCategory {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
}

export type VariableType = "STRING" | "NUMBER" | "BOOLEAN" | "ENUM" | "SECRET";

export interface TemplateVariable {
  id: string;
  envName: string;
  displayName: string;
  description: string | null;
  type: VariableType;
  defaultValue: string | null;
  rules: Record<string, unknown>;
  userEditable: boolean;
  userViewable: boolean;
  sortOrder: number;
}

/**
 * A server's editable environment variable as returned by
 * GET /servers/:id/variables — the template's variable schema merged with the
 * server's current value. Write-only secrets (userViewable=false) return an
 * empty `value` and an `isSet` flag instead of the stored secret.
 */
export interface ServerVariableField {
  envName: string;
  displayName: string;
  description: string | null;
  type: VariableType;
  rules: Record<string, unknown>;
  userEditable: boolean;
  userViewable: boolean;
  value: string;
  isSet?: boolean;
}

/** Java-version selector state for a Minecraft/Java server. */
export interface JavaVersionState {
  /** "auto" or a pinned major, e.g. "21". */
  selected: string;
  /** The Java major the server will actually run (override or auto). */
  effective: number;
  /** The major auto-selected from the Minecraft version. */
  auto: number;
  /** Majors the customer can pick from. */
  options: number[];
}

/** A shared MySQL/MariaDB host the panel provisions per-server databases on. */
export interface DatabaseHost {
  id: string;
  name: string;
  engine: "MYSQL" | "MARIADB" | "POSTGRESQL";
  host: string;
  port: number;
  username: string;
  publicHost: string;
  maxDatabases: number;
  isActive: boolean;
  databaseCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseHostInput {
  name: string;
  engine?: string;
  host: string;
  port?: number;
  username: string;
  password?: string;
  publicHost: string;
  maxDatabases?: number;
  isActive?: boolean;
}

/** A node's aggregate capacity vs current allocation (from GET /nodes/:id/capacity). */
export interface NodeCapacity {
  cpu: { total: number; used: number; free: number };
  memory: { total: number; used: number; free: number };
  disk: { total: number; used: number; free: number };
}

export interface GameTemplate {
  id: string;
  categoryId: string | null;
  category?: GameCategory | null;
  name: string;
  slug: string;
  author: string;
  description: string | null;
  version: number;
  deployMethods: DeployMethod[];
  supportsLinux: boolean;
  supportsWindows: boolean;
  dockerImages: Record<string, string>;
  steamAppId: number | null;
  startupCommand: string;
  recCpuCores: number;
  recMemoryMb: number;
  recDiskMb: number;
  supportsWorkshop?: boolean;
  workshopAppId?: number | null;
  iconUrl?: string | null;
  variables?: TemplateVariable[];
  // Public storefront metadata
  isPublished?: boolean;
  featured?: boolean;
  sortOrder?: number;
  longDescription?: string | null;
  cardImageUrl?: string | null;
  heroImageUrl?: string | null;
  tags?: string[];
}

// ---- Public storefront ----------------------------------------------------

export interface StartingPrice {
  amountMinor: number;
  currency: string;
}

export type WorkshopKind = "ITEM" | "COLLECTION";

/** A Steam Workshop item/collection attached to a server. */
export interface WorkshopMod {
  id: string;
  serverId: string;
  workshopId: string;
  name: string | null;
  kind: WorkshopKind;
  enabled: boolean;
  sortOrder: number;
}

/** Masked central Steam settings (never returns raw secrets). */
export interface SteamConfigMasked {
  username: string;
  apiKeySet: boolean;
  passwordSet: boolean;
  loginConfigured: boolean;
  /** A one-time Steam Guard code is staged for the next install. */
  guardCodePending: boolean;
}

/** TeamSpeak voice server connection details + first-boot ServerQuery admin creds. */
export interface VoiceInfo {
  address: string | null;
  voicePort: number | null;
  slots: number | null;
  /** True once the server has booted and written its admin credentials. */
  ready: boolean;
  queryAdmin: string | null;
  queryPassword: string | null;
  /** Raw (telnet) ServerQuery port — loopback-only on the node, default 10011. */
  queryPort: number;
  /** ServerQuery-over-SSH port (TeamSpeak query_ssh_port), default 10022. */
  querySshPort: number;
  privilegeKey: string | null;
  licenseAccepted: boolean;
  /**
   * Whether a commercial licensekey.dat is installed (needed for >32 slots).
   * Null when the node is unreachable / not provisioned yet.
   */
  licenseKeyInstalled: boolean | null;
}

export interface VoiceChannel {
  id: string;
  name: string;
  users: { clid: string; name: string }[];
  maxClients: number | null;
}

export interface VoiceBandwidthPoint {
  t: number;
  down: number;
  up: number;
}

export interface VoiceBan {
  banid: string;
  name: string | null;
  ip: string | null;
  reason: string | null;
  durationSeconds: number;
}

export interface VoiceAuditEntry {
  id: string;
  action: string;
  actor: string;
  at: string;
  detail: string | null;
}

export interface VoiceStatus {
  ready: boolean;
  online: number;
  maxClients: number | null;
  channelCount: number;
  uptimeSeconds: number;
  serverName: string | null;
  bandwidthDownBps: number;
  bandwidthUpBps: number;
  avgPingMs: number;
  updatedSecondsAgo: number | null;
  channels: VoiceChannel[];
  bans: VoiceBan[];
}

/** An admin-curated team member for the public "Meet the team" page. */
export interface TeamMember {
  id: string;
  name: string;
  title: string;
  bio: string | null;
  avatarUrl: string | null;
  link: string | null;
  isActive: boolean;
  sortOrder: number;
}

/** A published game as shown on the public homepage/catalog. */
export interface StorefrontGame {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  longDescription: string | null;
  featured: boolean;
  sortOrder: number;
  cardImageUrl: string | null;
  heroImageUrl: string | null;
  iconUrl: string | null;
  tags: string[];
  supportsLinux: boolean;
  supportsWindows: boolean;
  recCpuCores: number;
  recMemoryMb: number;
  recDiskMb: number;
  category: {
    id: string;
    name: string;
    slug: string;
    iconUrl: string | null;
  } | null;
  startingPrice: StartingPrice | null;
}

/** A safe, orderable plan view for the public game detail page. */
export interface StorefrontPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: ProductType;
  billingModel: BillingModel;
  perSlot: boolean;
  cpuCores: number | null;
  memoryMb: number | null;
  diskMb: number | null;
  slots: number | null;
  minSlots?: number;
  maxSlots?: number;
  slotStep?: number;
  prices: {
    id: string;
    interval: BillingInterval;
    currency: string;
    amountMinor: number;
  }[];
  hardwareTiers?: Array<{
    id: string;
    name: string;
    description: string | null;
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
    recommendedPlayers: number | null;
    isRecommended: boolean;
    sortOrder: number;
    prices: {
      id: string;
      interval: BillingInterval;
      currency: string;
      amountMinor: number;
    }[];
  }>;
}

export interface StorefrontGameDetail {
  game: StorefrontGame & {
    author: string;
    deployMethods: DeployMethod[];
    variables: Pick<
      TemplateVariable,
      | "envName"
      | "displayName"
      | "description"
      | "type"
      | "defaultValue"
      | "rules"
      | "sortOrder"
    >[];
  };
  plans: StorefrontPlan[];
  regions: { id: string; code: string; name: string; country: string }[];
}

// ---- Mods (Modrinth) ------------------------------------------------------

export interface ModrinthProject {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  iconUrl: string | null;
  categories: string[];
  clientSide: string;
  serverSide: string;
}

export interface ModrinthVersion {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  files: { url: string; filename: string; size: number; primary: boolean }[];
}

/** The modpack currently installed on a server (from its marker file). */
export interface InstalledModpack {
  projectId?: string;
  versionId?: string;
  title?: string;
  versionNumber?: string;
  mcVersion?: string;
  loader?: string;
  loaderVersion?: string;
  filesInstalled?: number;
  installedAt?: string;
}

export type HomepageAlertType =
  "INFO" | "SUCCESS" | "WARNING" | "DANGER" | "PROMO";

export interface HomepageAlert {
  id: string;
  type: HomepageAlertType;
  title: string;
  body: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissible: boolean;
  priority: number;
  createdAt: string;
  updatedAt?: string;
}

export type BackupState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface Backup {
  id: string;
  serverId: string;
  name: string;
  state: BackupState;
  storage: "LOCAL" | "S3";
  /** Live progress (0–100) while state is IN_PROGRESS. */
  progressPct?: number;
  sizeBytes: number;
  checksum: string | null;
  isLocked: boolean;
  error: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type DbEngine = "MYSQL" | "MARIADB" | "POSTGRESQL";

export interface ServerDatabase {
  id: string;
  engine: DbEngine;
  name: string;
  username: string;
  host: string;
  port: number;
  remoteAccess: string;
  password?: string; // returned once on creation
  createdAt: string;
}

export type ScheduleAction = "COMMAND" | "POWER" | "BACKUP";

export interface ScheduleTask {
  id: string;
  action: ScheduleAction;
  payload: string;
  timeOffsetMs: number;
  sortOrder: number;
  continueOnFailure: boolean;
  /** Action-specific extras — BACKUP: { mode: "ESSENTIALS" | "FULL" }. */
  options?: { mode?: "ESSENTIALS" | "FULL" } | null;
}

export interface Schedule {
  id: string;
  name: string;
  cron: string;
  isActive: boolean;
  onlyWhenOnline: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  tasks: ScheduleTask[];
  createdAt: string;
}

export interface SubUser {
  id: string;
  userId: string;
  email: string;
  permissions: string[];
  state: "ACTIVE" | "REVOKED";
  createdAt: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string;
  modified: string;
}

/** Status payload for the paid custom-server-address card. */
export interface VanityAddressStatus {
  /** Feature on AND the node has a branded game domain. */
  enabled: boolean;
  gameDomain: string | null;
  feeMinor: number;
  currency: string;
  /** The purchased label, or null when on the default shortId address. */
  currentLabel: string | null;
  currentAddress: string | null;
  pending: {
    label: string;
    address: string;
    invoiceId: string | null;
    amountMinor: number;
    currency: string;
  } | null;
}

/** State of the level.dat / level.dat_old pair for the world-recovery card. */
export interface LevelDatStatus {
  world: string;
  hasLevelDat: boolean;
  levelDatBytes: number | null;
  hasBackup: boolean;
  backupBytes: number | null;
  /** The current level.dat is missing or empty — likely the crash cause. */
  looksCorrupt: boolean;
  /** A plausibly-valid level.dat_old exists, so a restore can proceed. */
  restorable: boolean;
}

/** Outcome of promoting level.dat_old back to level.dat. */
export interface LevelDatRestoreResult {
  world: string;
  restored: boolean;
  /** Where the corrupt level.dat was preserved, if one existed. */
  preservedAs: string | null;
  restoredBytes: number | null;
}

// Billing
export type BillingInterval =
  "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
export type ProductType =
  | "GAME_SERVER"
  | "VOICE_SERVER"
  | "VPS"
  | "DEDICATED"
  | "ADDON"
  | "WEB_HOSTING"
  | "BOT_HOSTING";

export type BillingModel = "HARDWARE_TIER" | "PER_SLOT";

export interface Price {
  id: string;
  interval: BillingInterval;
  currency: string;
  amountMinor: number;
  stripePriceId?: string | null;
  isActive?: boolean;
  hardwareTierId?: string | null;
}

/** A fixed hardware package (Low/Mid/High) under a HARDWARE_TIER game product. */
export interface HardwareTier {
  id: string;
  name: string;
  description: string | null;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  recommendedPlayers: number | null;
  isRecommended: boolean;
  isActive?: boolean;
  sortOrder: number;
  prices: Price[];
}

export interface Product {
  id: string;
  type: ProductType;
  billingModel: BillingModel;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  cpuCores: number | null;
  memoryMb: number | null;
  diskMb: number | null;
  slots: number | null;
  allowedTemplateIds: string[];
  prices: Price[];
  // Hardware tiers (HARDWARE_TIER game products).
  hardwareTiers?: HardwareTier[];
  // GPortal-style per-slot pricing (PER_SLOT voice products).
  perSlot: boolean;
  gameTemplateId: string | null;
  minSlots: number;
  maxSlots: number;
  slotStep: number;
  cpuPerSlot: number;
  memoryMbPerSlot: number;
  diskMbPerSlot: number;
}

export type SubscriptionState =
  "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "SUSPENDED" | "EXPIRED";

export interface Subscription {
  id: string;
  productId: string;
  product?: Pick<Product, "id" | "name" | "type"> & {
    perSlot?: boolean;
    billingModel?: BillingModel;
  };
  hardwareTier?: {
    id: string;
    name: string;
    cpuCores: number;
    memoryMb: number;
    diskMb: number;
  } | null;
  priceId: string;
  interval: BillingInterval;
  slots?: number;
  state: SubscriptionState;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  gateway: string;
  createdAt: string;
  /** Recurring amount billed at renewal (per-slot rate × slots), minor units. */
  renewalAmountMinor?: number;
  currency?: string;
  /** Servers this subscription funds. */
  servers?: Array<{
    id: string;
    shortId: string;
    name: string;
    state: ServerState;
  }>;
}

export type InvoiceState =
  "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE" | "REFUNDED";

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitMinor: number;
  amountMinor: number;
}

export interface Invoice {
  id: string;
  number: string;
  state: InvoiceState;
  currency: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  dueAt: string | null;
  paidAt: string | null;
  pdfUrl: string | null;
  lineItems?: InvoiceLineItem[];
  createdAt: string;
}

export type CouponKind = "PERCENT" | "FIXED";

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  kind: CouponKind;
  value: number; // percent 1-100, or fixed minor units
  currency: string;
  minSubtotalMinor: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  maxPerUser: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { redemptions: number };
}

export interface GiftCard {
  id: string;
  code: string;
  initialBalanceMinor: number;
  balanceMinor: number;
  currency: string;
  isActive: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface PaymentMethod {
  id: string;
  gateway: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  createdAt: string;
}

// Support
export type TicketState =
  | "OPEN"
  | "PENDING_CUSTOMER"
  | "PENDING_AGENT"
  | "RESOLVED"
  | "CLOSED"
  | "ARCHIVED";
export type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  state: TicketState;
  priority: TicketPriority;
  categoryId: string | null;
  assigneeId: string | null;
  requester?: Pick<User, "id" | "email" | "firstName" | "lastName">;
  assignee?: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
  slaBreached?: boolean;
  _count?: { messages: number };
  createdAt: string;
  updatedAt: string;
}

export interface TicketCategory {
  id: string;
  name: string;
  slug: string;
  slaFirstResponseMin: number;
  slaResolutionMin: number;
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
}

export interface StaffMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  globalRole: GlobalRole;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  author?: Pick<
    User,
    "id" | "email" | "firstName" | "lastName" | "avatarUrl" | "globalRole"
  >;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface KbArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string | null;
  isPublished: boolean;
  views: number;
  updatedAt: string;
}

// Platform
export interface AuditLog {
  id: string;
  actorId: string | null;
  actor?: Pick<User, "id" | "email"> | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface GlobalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ("READ" | "WRITE" | "ADMIN" | "STATUS_READ")[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  token?: string; // returned once
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: string;
  current?: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  // The panel-api returns a FLAT token payload. When MFA is required it returns
  // a challenge (mfaRequired + mfaToken) and the token fields are empty.
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  mfaRequired?: boolean;
  mfaToken?: string;
  methods?: ("totp" | "webauthn" | "recovery")[];
}

export type StatusLevel = "operational" | "maintenance" | "degraded" | "outage";

export interface StatusComponent {
  key: string;
  name: string;
  status: StatusLevel;
}

export interface StatusRegion {
  code: string;
  name: string;
  country: string;
  status: StatusLevel;
  nodesUp: number;
  nodesTotal: number;
  nodes: { name: string; status: StatusLevel }[];
}

export type IncidentImpact = "MAINTENANCE" | "DEGRADED" | "OUTAGE";
export type IncidentStatusStage =
  "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";

export interface IncidentUpdate {
  id?: string;
  status: IncidentStatusStage;
  body: string;
  createdAt: string;
}

export interface StatusIncident {
  id: string;
  title: string;
  status: IncidentStatusStage;
  impact: IncidentImpact;
  components: string[];
  startedAt: string;
  resolvedAt: string | null;
  updates: IncidentUpdate[];
}

export interface SystemStatus {
  status: StatusLevel;
  updatedAt: string;
  components: StatusComponent[];
  regions: StatusRegion[];
  incidents: { active: StatusIncident[]; recent: StatusIncident[] };
}

export interface StatusWebhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  description: string | null;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  createdAt: string;
}
