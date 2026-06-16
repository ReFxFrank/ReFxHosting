-- Add a PENDING_PAYMENT state so servers can be reserved but not installed until
-- the first payment clears.
ALTER TYPE "ServerState" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
