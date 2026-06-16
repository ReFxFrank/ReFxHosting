-- Persist the payment-gateway customer handle (Stripe cus_...) for off-session
-- charging of saved cards at renewal.
ALTER TABLE "User" ADD COLUMN "gatewayCustomerId" TEXT;
