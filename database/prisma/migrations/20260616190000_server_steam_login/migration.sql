-- Per-server (customer-owned) Steam login for Workshop downloads. Password
-- stored AES-256-GCM encrypted; used at install time, never returned to clients.
ALTER TABLE "Server"
  ADD COLUMN "steamUsername" TEXT,
  ADD COLUMN "steamPasswordEnc" TEXT;
