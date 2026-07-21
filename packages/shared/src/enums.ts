/**
 * Canonical enums shared across the platform.
 *
 * These MUST stay in lock-step with `database/prisma/schema.prisma`. They are
 * declared as `const` objects + union types (rather than TS `enum`) so the
 * string values are identical to what Prisma stores and what the API emits,
 * and so they tree-shake cleanly in the Next.js bundle.
 */

export const GlobalRole = {
  CUSTOMER: 'CUSTOMER',
  SUPPORT: 'SUPPORT',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
} as const;
export type GlobalRole = (typeof GlobalRole)[keyof typeof GlobalRole];

export const UserState = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
} as const;
export type UserState = (typeof UserState)[keyof typeof UserState];

export const NodeOs = { LINUX: 'LINUX', WINDOWS: 'WINDOWS' } as const;
export type NodeOs = (typeof NodeOs)[keyof typeof NodeOs];

export const NodeState = {
  PROVISIONING: 'PROVISIONING',
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  MAINTENANCE: 'MAINTENANCE',
  DEGRADED: 'DEGRADED',
} as const;
export type NodeState = (typeof NodeState)[keyof typeof NodeState];

export const DeployMethod = {
  DOCKER: 'DOCKER',
  NATIVE_PROCESS: 'NATIVE_PROCESS',
  WINDOWS_CONTAINER: 'WINDOWS_CONTAINER',
  SANDBOX: 'SANDBOX',
} as const;
export type DeployMethod = (typeof DeployMethod)[keyof typeof DeployMethod];

export const ServerState = {
  INSTALLING: 'INSTALLING',
  OFFLINE: 'OFFLINE',
  STARTING: 'STARTING',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  CRASHED: 'CRASHED',
  SUSPENDED: 'SUSPENDED',
  REINSTALLING: 'REINSTALLING',
  SWITCHING_GAME: 'SWITCHING_GAME',
  TRANSFERRING: 'TRANSFERRING',
  /** Reserved at order time; provisioning starts when the invoice settles. */
  PENDING_PAYMENT: 'PENDING_PAYMENT',
} as const;
export type ServerState = (typeof ServerState)[keyof typeof ServerState];

/** Lifecycle of an admin-initiated server transfer between nodes. */
export const TransferState = {
  PENDING: 'PENDING',
  SNAPSHOTTING: 'SNAPSHOTTING',
  PROVISIONING: 'PROVISIONING',
  RESTORING: 'RESTORING',
  FINALIZING: 'FINALIZING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;
export type TransferState = (typeof TransferState)[keyof typeof TransferState];

export const VariableType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  ENUM: 'ENUM',
  SECRET: 'SECRET',
} as const;
export type VariableType = (typeof VariableType)[keyof typeof VariableType];

export const BackupState = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type BackupState = (typeof BackupState)[keyof typeof BackupState];

/** Where a backup archive lives: node-local disk or offsite S3/R2 ("Express"). */
export const BackupStorage = {
  LOCAL: 'LOCAL',
  S3: 'S3',
} as const;
export type BackupStorage = (typeof BackupStorage)[keyof typeof BackupStorage];

export const DbEngine = {
  MYSQL: 'MYSQL',
  MARIADB: 'MARIADB',
  POSTGRESQL: 'POSTGRESQL',
} as const;
export type DbEngine = (typeof DbEngine)[keyof typeof DbEngine];

/** What a schedule task does (multi-step schedules chain these). */
export const ScheduleAction = {
  COMMAND: 'COMMAND',
  POWER: 'POWER',
  BACKUP: 'BACKUP',
} as const;
export type ScheduleAction =
  (typeof ScheduleAction)[keyof typeof ScheduleAction];

/**
 * What kind of workload a server hosts (game, voice e.g. TeamSpeak 3, web app,
 * or Discord bot). Set once at server creation and immutable — the
 * authoritative discriminator (replaces the old template-slug heuristic).
 * Distinct from ProductType, which classifies a billing *product*, not a server.
 */
export const ServerType = {
  GAME_SERVER: 'GAME_SERVER',
  VOICE_SERVER: 'VOICE_SERVER',
  WEB_APP: 'WEB_APP',
  BOT_APP: 'BOT_APP',
} as const;
export type ServerType = (typeof ServerType)[keyof typeof ServerType];

/** What a GameTemplate provisions (game server, web app container, or bot). */
export const TemplateKind = {
  GAME: 'GAME',
  WEB: 'WEB',
  BOT: 'BOT',
} as const;
export type TemplateKind = (typeof TemplateKind)[keyof typeof TemplateKind];

/** TLS issuance state for a WEB_APP custom domain. */
export const SslStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
} as const;
export type SslStatus = (typeof SslStatus)[keyof typeof SslStatus];

/** A Steam Workshop entry: a single item or a whole collection. */
export const WorkshopKind = {
  ITEM: 'ITEM',
  COLLECTION: 'COLLECTION',
} as const;
export type WorkshopKind = (typeof WorkshopKind)[keyof typeof WorkshopKind];

export const SubUserState = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type SubUserState = (typeof SubUserState)[keyof typeof SubUserState];

export const ProductType = {
  GAME_SERVER: 'GAME_SERVER',
  VOICE_SERVER: 'VOICE_SERVER',
  VPS: 'VPS',
  DEDICATED: 'DEDICATED',
  ADDON: 'ADDON',
  WEB_HOSTING: 'WEB_HOSTING',
  BOT_HOSTING: 'BOT_HOSTING',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

/** How a product is configured + priced at order time. */
export const BillingModel = {
  HARDWARE_TIER: 'HARDWARE_TIER',
  PER_SLOT: 'PER_SLOT',
} as const;
export type BillingModel = (typeof BillingModel)[keyof typeof BillingModel];

export const BillingInterval = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMIANNUAL: 'SEMIANNUAL',
  ANNUAL: 'ANNUAL',
} as const;
export type BillingInterval =
  (typeof BillingInterval)[keyof typeof BillingInterval];

export const SubscriptionState = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  SUSPENDED: 'SUSPENDED',
  EXPIRED: 'EXPIRED',
} as const;
export type SubscriptionState =
  (typeof SubscriptionState)[keyof typeof SubscriptionState];

export const InvoiceState = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  PAID: 'PAID',
  VOID: 'VOID',
  UNCOLLECTIBLE: 'UNCOLLECTIBLE',
  REFUNDED: 'REFUNDED',
} as const;
export type InvoiceState = (typeof InvoiceState)[keyof typeof InvoiceState];

export const CouponKind = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;
export type CouponKind = (typeof CouponKind)[keyof typeof CouponKind];

/** Why a store-credit ledger entry exists. */
export const CreditReason = {
  ADMIN_GRANT: 'ADMIN_GRANT',
  REFUND: 'REFUND',
  GIFT_CARD: 'GIFT_CARD',
  INVOICE_PAYMENT: 'INVOICE_PAYMENT',
  ADJUSTMENT: 'ADJUSTMENT',
  REFERRAL: 'REFERRAL',
} as const;
export type CreditReason = (typeof CreditReason)[keyof typeof CreditReason];

export const PaymentState = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentState = (typeof PaymentState)[keyof typeof PaymentState];

export const TicketState = {
  OPEN: 'OPEN',
  PENDING_CUSTOMER: 'PENDING_CUSTOMER',
  PENDING_AGENT: 'PENDING_AGENT',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TicketState = (typeof TicketState)[keyof typeof TicketState];

export const TicketPriority = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type TicketPriority =
  (typeof TicketPriority)[keyof typeof TicketPriority];

export const BugSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type BugSeverity = (typeof BugSeverity)[keyof typeof BugSeverity];

export const BugStatus = {
  NEW: 'NEW',
  TRIAGED: 'TRIAGED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type BugStatus = (typeof BugStatus)[keyof typeof BugStatus];

/** Delivery channel for a user notification. */
export const NotificationChannel = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const AlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

/** Public storefront homepage notices (separate from the internal AlertSeverity). */
export const HomepageAlertType = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  DANGER: 'DANGER',
  PROMO: 'PROMO',
} as const;
export type HomepageAlertType =
  (typeof HomepageAlertType)[keyof typeof HomepageAlertType];

export const IncidentStatus = {
  INVESTIGATING: 'INVESTIGATING',
  IDENTIFIED: 'IDENTIFIED',
  MONITORING: 'MONITORING',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus =
  (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentImpact = {
  MAINTENANCE: 'MAINTENANCE',
  DEGRADED: 'DEGRADED',
  OUTAGE: 'OUTAGE',
} as const;
export type IncidentImpact =
  (typeof IncidentImpact)[keyof typeof IncidentImpact];

export const ApiKeyScope = {
  READ: 'READ',
  WRITE: 'WRITE',
  ADMIN: 'ADMIN',
  /** Isolated to the public status routes (e.g. the Helios bot) — denied everywhere else. */
  STATUS_READ: 'STATUS_READ',
} as const;
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];
