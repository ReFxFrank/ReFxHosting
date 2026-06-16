// Shared API types for the ReFx web panel.
// These mirror the canonical Prisma schema (database/prisma/schema.prisma) but
// only the fields the panel consumes over REST. In production these would be
// generated from the OpenAPI spec in packages/shared.
// TODO(impl): replace hand-written types with generated @refx/shared client.

export type GlobalRole = "CUSTOMER" | "SUPPORT" | "ADMIN" | "OWNER";
export type UserState = "ACTIVE" | "SUSPENDED" | "BANNED" | "PENDING_VERIFICATION";

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
  // Contact / billing address (self-service, optional).
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  /** Effective admin permissions (present on /auth/me; gates the admin UI). */
  permissions?: string[];
  roleId?: string | null;
  createdAt: string;
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

export interface Server {
  id: string;
  shortId: string;
  name: string;
  description: string | null;
  ownerId: string;
  nodeId: string;
  node?: Pick<Node, "id" | "name" | "fqdn" | "regionId">;
  templateId: string | null;
  template?: Pick<GameTemplate, "id" | "name" | "slug"> | null;
  templateVersion: number | null;
  state: ServerState;
  deployMethod: DeployMethod;
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
}

/** Server shape returned by the admin list (adds the owner relation). */
export interface AdminServer extends Server {
  owner?: Pick<User, "id" | "email" | "firstName" | "lastName"> | null;
}

/** Minimal customer reference embedded in admin billing rows. */
export type AdminUserRef = Pick<User, "id" | "email" | "firstName" | "lastName">;

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
  passwordSet: boolean;
}

/** Full account view for the admin user-detail page. */
export interface AdminUserDetail extends User {
  ownedServers?: Array<
    Pick<Server, "id" | "shortId" | "name" | "state"> & { node?: { name: string } }
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

export interface ServerStat {
  cpuPct: number;
  memUsedMb: number;
  diskUsedMb: number;
  netRxBytes: number;
  netTxBytes: number;
  players: number | null;
  recordedAt: string;
}

export type DeployMethod = "DOCKER" | "NATIVE_PROCESS" | "WINDOWS_CONTAINER" | "SANDBOX";

export interface Allocation {
  id: string;
  ip: string;
  port: number;
  alias: string | null;
  isPrimary: boolean;
}

export type NodeState = "PROVISIONING" | "ONLINE" | "OFFLINE" | "MAINTENANCE" | "DEGRADED";
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
  regionId: string;
  region?: { id: string; code: string; name: string; country?: string | null };
  os: NodeOs;
  state: NodeState;
  maintenance: boolean;
  agentVersion: string | null;
  cpuCores: number;
  memoryMb: number;
  diskMb: number;
  /** Public port range the panel auto-assigns to servers on this node. */
  allocationPortStart?: number;
  allocationPortEnd?: number;
  servers?: number;
  /** Most-recent heartbeat for live gauges (null until the agent reports). */
  latestHeartbeat?: NodeHeartbeat | null;
  createdAt: string;
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
  category: { id: string; name: string; slug: string; iconUrl: string | null } | null;
  startingPrice: StartingPrice | null;
}

/** A safe, orderable plan view for the public game detail page. */
export interface StorefrontPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cpuCores: number | null;
  memoryMb: number | null;
  diskMb: number | null;
  slots: number | null;
  prices: { id: string; interval: BillingInterval; currency: string; amountMinor: number }[];
}

export interface StorefrontGameDetail {
  game: StorefrontGame & {
    author: string;
    deployMethods: DeployMethod[];
    variables: Pick<
      TemplateVariable,
      "envName" | "displayName" | "description" | "type" | "defaultValue" | "rules" | "sortOrder"
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
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  downloads: number;
  files: { url: string; filename: string; size: number; primary: boolean }[];
}

export type HomepageAlertType = "INFO" | "SUCCESS" | "WARNING" | "DANGER" | "PROMO";

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

// Billing
export type BillingInterval =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL";
export type ProductType = "GAME_SERVER" | "VPS" | "DEDICATED" | "ADDON";

export interface Price {
  id: string;
  interval: BillingInterval;
  currency: string;
  amountMinor: number;
  stripePriceId?: string | null;
  isActive?: boolean;
}

export interface Product {
  id: string;
  type: ProductType;
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
  // GPortal-style per-slot pricing.
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
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "SUSPENDED"
  | "EXPIRED";

export interface Subscription {
  id: string;
  productId: string;
  product?: Pick<Product, "id" | "name" | "type">;
  priceId: string;
  interval: BillingInterval;
  state: SubscriptionState;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  gateway: string;
  createdAt: string;
}

export type InvoiceState = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE" | "REFUNDED";

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
export type TicketState = "OPEN" | "PENDING_CUSTOMER" | "PENDING_AGENT" | "RESOLVED" | "CLOSED";
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
  author?: Pick<User, "id" | "email" | "firstName" | "lastName" | "avatarUrl" | "globalRole">;
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
  scopes: ("READ" | "WRITE" | "ADMIN")[];
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
