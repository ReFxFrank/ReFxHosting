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

export const JOB = {
  PROVISION: 'provision',
  REINSTALL: 'reinstall',
  RUN_BACKUP: 'run-backup',
  RENEW: 'renew',
  DUNNING: 'dunning',
  SUSPEND: 'suspend',
} as const;
