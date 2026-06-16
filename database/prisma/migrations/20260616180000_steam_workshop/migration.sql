-- Steam Workshop management: per-server Workshop items/collections + template flags.
ALTER TABLE "GameTemplate"
  ADD COLUMN "supportsWorkshop" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workshopAppId" INTEGER;

DO $$ BEGIN
  CREATE TYPE "WorkshopKind" AS ENUM ('ITEM', 'COLLECTION');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE "WorkshopMod" (
  "id"         UUID NOT NULL,
  "serverId"   UUID NOT NULL,
  "workshopId" TEXT NOT NULL,
  "name"       TEXT,
  "kind"       "WorkshopKind" NOT NULL DEFAULT 'ITEM',
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkshopMod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkshopMod_serverId_workshopId_key" ON "WorkshopMod"("serverId", "workshopId");
CREATE INDEX "WorkshopMod_serverId_idx" ON "WorkshopMod"("serverId");
ALTER TABLE "WorkshopMod" ADD CONSTRAINT "WorkshopMod_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
