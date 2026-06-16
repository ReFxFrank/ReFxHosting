-- Track refresh-token rotation so a benign concurrent refresh (e.g. two tabs)
-- doesn't trip reuse-detection and revoke the whole session family.
ALTER TABLE "Session" ADD COLUMN "rotatedAt" TIMESTAMP(3);
