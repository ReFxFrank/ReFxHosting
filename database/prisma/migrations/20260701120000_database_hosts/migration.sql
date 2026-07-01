-- AlterTable
ALTER TABLE "ServerDatabase" ADD COLUMN     "hostId" UUID;

-- CreateTable
CREATE TABLE "DatabaseHost" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "engine" "DbEngine" NOT NULL DEFAULT 'MARIADB',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 3306,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "publicHost" TEXT NOT NULL,
    "maxDatabases" INTEGER NOT NULL DEFAULT 500,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseHost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ServerDatabase" ADD CONSTRAINT "ServerDatabase_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "DatabaseHost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

