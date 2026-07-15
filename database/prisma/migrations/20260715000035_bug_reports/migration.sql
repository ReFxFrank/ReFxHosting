-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('NEW', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stepsToReproduce" TEXT,
    "severity" "BugSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "BugStatus" NOT NULL DEFAULT 'NEW',
    "area" TEXT,
    "reporterId" UUID,
    "assigneeId" UUID,
    "serverId" UUID,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugComment" (
    "id" UUID NOT NULL,
    "bugReportId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugAttachment" (
    "id" UUID NOT NULL,
    "bugReportId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BugReport_number_key" ON "BugReport"("number");

-- CreateIndex
CREATE INDEX "BugReport_status_idx" ON "BugReport"("status");

-- CreateIndex
CREATE INDEX "BugReport_reporterId_idx" ON "BugReport"("reporterId");

-- CreateIndex
CREATE INDEX "BugReport_assigneeId_idx" ON "BugReport"("assigneeId");

-- CreateIndex
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- CreateIndex
CREATE INDEX "BugComment_bugReportId_idx" ON "BugComment"("bugReportId");

-- CreateIndex
CREATE INDEX "BugAttachment_bugReportId_idx" ON "BugAttachment"("bugReportId");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugComment" ADD CONSTRAINT "BugComment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugComment" ADD CONSTRAINT "BugComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugAttachment" ADD CONSTRAINT "BugAttachment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
