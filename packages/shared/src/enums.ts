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
} as const;
export type ServerState = (typeof ServerState)[keyof typeof ServerState];

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

export const DbEngine = {
  MYSQL: 'MYSQL',
  MARIADB: 'MARIADB',
  POSTGRESQL: 'POSTGRESQL',
} as const;
export type DbEngine = (typeof DbEngine)[keyof typeof DbEngine];

export const ProductType = {
  GAME_SERVER: 'GAME_SERVER',
  VPS: 'VPS',
  DEDICATED: 'DEDICATED',
  ADDON: 'ADDON',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

export const BillingInterval = {
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

export const TicketState = {
  OPEN: 'OPEN',
  PENDING_CUSTOMER: 'PENDING_CUSTOMER',
  PENDING_AGENT: 'PENDING_AGENT',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
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

export const AlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export const ApiKeyScope = {
  READ: 'READ',
  WRITE: 'WRITE',
  ADMIN: 'ADMIN',
} as const;
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];
