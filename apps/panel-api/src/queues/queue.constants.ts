/**
 * Central registry of BullMQ queue names and job payload contracts. Producers
 * (services) and consumers (processors) import from here so the contract stays
 * in one place.
 */

export const QUEUE = {
  PROVISIONING: 'provisioning',
  REINSTALL: 'reinstall',
  BACKUPS: 'backups',
  BILLING_RENEWAL: 'billing-renewal',
  SUSPENSION: 'suspension',
  MODPACK: 'modpack',
  TRANSFER: 'transfer',
  WEBHOOK_DELIVERY: 'webhook-delivery',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

// ---- Job payloads ---------------------------------------------------------

export interface ProvisionJob {
  serverId: string;
}

/** Push a server's current DB resource limits to its node agent (no reinstall). */
export interface ReconfigureJob {
  serverId: string;
}

export interface ReinstallJob {
  serverId: string;
  /** When set, this is a game switch; carries the switch-log id for tracing. */
  gameSwitchLogId?: string;
  preserveData?: boolean;
  /** Mods-only sync (Workshop Apply): skip the base game re-validation. */
  workshopSync?: boolean;
}

export interface BackupJob {
  serverId: string;
  backupId: string;
}

export interface BillingRenewalJob {
  subscriptionId: string;
}

export type SuspensionAction = 'suspend' | 'unsuspend';

export interface SuspensionJob {
  serverId?: string;
  subscriptionId?: string;
  action: SuspensionAction;
  reason?: string;
}

export interface ModpackInstallJob {
  serverId: string;
  /** Modrinth modpack version id (the .mrpack to install). */
  versionId: string;
  /** Display title for notifications. */
  title?: string;
}

export interface ModpackUninstallJob {
  serverId: string;
  /** Display title for notifications. */
  title?: string;
}

/** Move a server from its current node to another (admin-only node transfer). */
export interface TransferJob {
  transferId: string;
}

/** Status-event webhook types pushed to subscribers (Helios, etc.). */
export type StatusWebhookEvent =
  | 'incident.created'
  | 'incident.updated'
  | 'incident.resolved'
  | 'component.status_changed';

export const STATUS_WEBHOOK_EVENTS: StatusWebhookEvent[] = [
  'incident.created',
  'incident.updated',
  'incident.resolved',
  'component.status_changed',
];

/**
 * One signed delivery attempt of an outbound status webhook. The raw `body` is
 * carried verbatim (built once at dispatch) so the SAME bytes are HMAC-signed
 * and sent; `deliveryId` is stable across BullMQ retries → idempotent.
 */
export interface WebhookDeliveryJob {
  webhookId: string;
  event: StatusWebhookEvent;
  deliveryId: string;
  body: string;
}

export const JOB = {
  PROVISION: 'provision',
  RECONFIGURE: 'reconfigure',
  REINSTALL: 'reinstall',
  RUN_BACKUP: 'run-backup',
  RENEW: 'renew',
  DUNNING: 'dunning',
  SUSPEND: 'suspend',
  INSTALL_MODPACK: 'install-modpack',
  UNINSTALL_MODPACK: 'uninstall-modpack',
  TRANSFER: 'transfer',
  DELIVER_WEBHOOK: 'deliver-webhook',
} as const;
