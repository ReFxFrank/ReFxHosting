-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

