-- Recurring PayPal: persist the lazily-created PayPal catalog product id (per
-- Product) and billing-plan id (per Price), so a PayPal subscription reuses the
-- same plan across orders instead of creating duplicates.
ALTER TABLE "Product" ADD COLUMN "paypalProductId" TEXT;
ALTER TABLE "Price" ADD COLUMN "paypalPlanId" TEXT;
