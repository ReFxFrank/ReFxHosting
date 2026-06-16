-- One-time Steam Guard code supplied for the next install (consumed + cleared by
-- the install job; the node then remembers the machine via steamcmd's sentry).
ALTER TABLE "Server" ADD COLUMN "steamGuardCode" TEXT;
