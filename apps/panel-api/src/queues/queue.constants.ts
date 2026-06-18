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
  WEBHOOKS: 'webhooks',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

// ---- Job payloads ---------------------------------------------------------

export interface ProvisionJob {
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

/**
 * A single outbound webhook delivery. The envelope (`payload`) is built once by
 * the producer and stored verbatim so every retry signs and sends identical
 * bytes; `deliveryId` is the stable idempotency key across retries.
 */
export interface WebhookDeliveryJob {
  event: string;
  deliveryId: string;
  payload: {
    event: string;
    occurredAt: string;
    data: Record<string, unknown>;
  };
}

export const JOB = {
  PROVISION: 'provision',
  REINSTALL: 'reinstall',
  RUN_BACKUP: 'run-backup',
  RENEW: 'renew',
  DUNNING: 'dunning',
  SUSPEND: 'suspend',
  INSTALL_MODPACK: 'install-modpack',
  UNINSTALL_MODPACK: 'uninstall-modpack',
  DELIVER_WEBHOOK: 'deliver-webhook',
} as const;
