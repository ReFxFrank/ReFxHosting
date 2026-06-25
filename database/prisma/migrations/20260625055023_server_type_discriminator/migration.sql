-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('GAME_SERVER', 'VOICE_SERVER');

-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "serverType" "ServerType" NOT NULL DEFAULT 'GAME_SERVER';

-- CreateIndex
CREATE INDEX "Server_serverType_idx" ON "Server"("serverType");

-- Backfill: classify existing voice servers using the EXACT predicate the app
-- used before this discriminator existed (template slug LIKE 'teamspeak%' OR the
-- template's category slug = 'voice'), so no live voice server is left tagged as
-- a game server (which would wrongly offer game-switching).
UPDATE "Server" s
SET "serverType" = 'VOICE_SERVER'
FROM "GameTemplate" t
LEFT JOIN "GameCategory" c ON c."id" = t."categoryId"
WHERE s."templateId" = t."id"
  AND (t."slug" LIKE 'teamspeak%' OR c."slug" = 'voice');
