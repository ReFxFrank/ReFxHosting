-- The original product-level Price uniqueness was created by 0_init as a UNIQUE
-- INDEX ("CREATE UNIQUE INDEX Price_productId_interval_currency_key"), not a
-- table CONSTRAINT — so the earlier `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`
-- silently no-op'd and the index survived. That index blocks two hardware tiers
-- from sharing an interval (tier pricing). Drop it for real here.
--
-- Idempotent + covers both shapes: DROP CONSTRAINT handles environments where it
-- was ever promoted to a constraint; DROP INDEX handles the standard index form.
ALTER TABLE "Price" DROP CONSTRAINT IF EXISTS "Price_productId_interval_currency_key";
DROP INDEX IF EXISTS "Price_productId_interval_currency_key";

-- Ensure the tier-aware composite uniqueness exists (constraint form is fine; it
-- creates a backing index of the same name Prisma expects).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Price_productId_hardwareTierId_interval_currency_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'Price_productId_hardwareTierId_interval_currency_key'
  ) THEN
    ALTER TABLE "Price"
      ADD CONSTRAINT "Price_productId_hardwareTierId_interval_currency_key"
      UNIQUE ("productId", "hardwareTierId", "interval", "currency");
  END IF;
END $$;
