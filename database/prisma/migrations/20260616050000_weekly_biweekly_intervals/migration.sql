-- Add shorter billing terms.
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'WEEKLY';
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'BIWEEKLY';
