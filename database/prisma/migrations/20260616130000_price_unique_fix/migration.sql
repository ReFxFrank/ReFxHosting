-- Tier pricing needs Price uniqueness to include the hardware tier, so each tier
-- can carry its own per-interval price. Some environments still have the original
-- product-level unique constraint `Price_productId_interval_currency_key` (it
-- blocks multiple tiers from sharing an interval, and blocks a tier price that
-- shares an interval with a legacy product-level price). This migration is fully
-- idempotent: it drops the old constraint if present and ensures the tier-aware
-- composite exists, regardless of how the prior migration was applied.

ALTER TABLE "Price" DROP CONSTRAINT IF EXISTS "Price_productId_interval_currency_key";

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Price_productId_hardwareTierId_interval_currency_key'
  ) THEN
    ALTER TABLE "Price"
      ADD CONSTRAINT "Price_productId_hardwareTierId_interval_currency_key"
      UNIQUE ("productId", "hardwareTierId", "interval", "currency");
  END IF;
END $$;
