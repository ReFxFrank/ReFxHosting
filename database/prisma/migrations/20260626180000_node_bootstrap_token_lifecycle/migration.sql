-- Make the node bootstrap token single-use and time-boxed. The token returned
-- at node creation must be presented before it expires and exactly once; a
-- successful agent registration stamps bootstrapTokenUsedAt. Rotating the token
-- (admin regenerate) clears used and sets a fresh expiry.

-- AlterTable
ALTER TABLE "Node" ADD COLUMN "bootstrapTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Node" ADD COLUMN "bootstrapTokenUsedAt" TIMESTAMP(3);
