-- Hardware-tier game products + slot-based voice products (TeamSpeak 3).
-- Game servers move back to fixed hardware packages (Low/Mid/High HardwareTier);
-- voice servers keep the GPortal-style per-slot model.

-- New product type for voice hosting.
ALTER TYPE "ProductType" ADD VALUE IF NOT EXISTS 'VOICE_SERVER';

-- Billing/configuration model classifier.
DO $$ BEGIN
  CREATE TYPE "BillingModel" AS ENUM ('HARDWARE_TIER', 'PER_SLOT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Product gains an explicit billing model. Default existing rows from `perSlot`
-- so current per-slot products are classified as PER_SLOT and the rest as
-- HARDWARE_TIER (their flat resources become a fallback under tiers).
ALTER TABLE "Product"
  ADD COLUMN "billingModel" "BillingModel" NOT NULL DEFAULT 'HARDWARE_TIER';
UPDATE "Product" SET "billingModel" = 'PER_SLOT' WHERE "perSlot" = true;

-- Hardware tiers (Low/Mid/High) under a HARDWARE_TIER game product.
CREATE TABLE "HardwareTier" (
  "id"                 UUID NOT NULL,
  "productId"          UUID NOT NULL,
  "name"               TEXT NOT NULL,
  "description"        TEXT,
  "cpuCores"           DOUBLE PRECISION NOT NULL DEFAULT 1,
  "memoryMb"           INTEGER NOT NULL DEFAULT 1024,
  "diskMb"             INTEGER NOT NULL DEFAULT 5120,
  "recommendedPlayers" INTEGER,
  "isRecommended"      BOOLEAN NOT NULL DEFAULT false,
  "isActive"           BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HardwareTier_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HardwareTier_productId_idx" ON "HardwareTier"("productId");
ALTER TABLE "HardwareTier" ADD CONSTRAINT "HardwareTier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prices can belong to a specific hardware tier (game tiers price per tier);
-- NULL = product-level price (per-slot/voice products).
ALTER TABLE "Price" ADD COLUMN "hardwareTierId" UUID;

-- Widen the price uniqueness to include the tier so each tier can carry its own
-- per-interval price. (Product-level uniqueness for the NULL-tier case is
-- enforced in application code, since SQL treats NULLs as distinct.)
ALTER TABLE "Price" DROP CONSTRAINT IF EXISTS "Price_productId_interval_currency_key";
ALTER TABLE "Price"
  ADD CONSTRAINT "Price_productId_hardwareTierId_interval_currency_key"
  UNIQUE ("productId", "hardwareTierId", "interval", "currency");
CREATE INDEX "Price_hardwareTierId_idx" ON "Price"("hardwareTierId");
ALTER TABLE "Price" ADD CONSTRAINT "Price_hardwareTierId_fkey"
  FOREIGN KEY ("hardwareTierId") REFERENCES "HardwareTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subscriptions record the chosen hardware tier (game orders).
ALTER TABLE "Subscription" ADD COLUMN "hardwareTierId" UUID;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_hardwareTierId_fkey"
  FOREIGN KEY ("hardwareTierId") REFERENCES "HardwareTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
