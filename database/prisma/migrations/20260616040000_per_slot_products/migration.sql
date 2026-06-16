-- GPortal-style per-slot products + subscription slot quantity.
ALTER TABLE "Subscription" ADD COLUMN "slots" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Product"
  ADD COLUMN "perSlot" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gameTemplateId" UUID,
  ADD COLUMN "minSlots" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "maxSlots" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "slotStep" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cpuPerSlot" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "memoryMbPerSlot" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "diskMbPerSlot" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "Product_gameTemplateId_idx" ON "Product"("gameTemplateId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_gameTemplateId_fkey"
  FOREIGN KEY ("gameTemplateId") REFERENCES "GameTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
