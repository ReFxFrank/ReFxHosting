-- Admin-curated team members for the public "Meet the team" page.
CREATE TABLE "StaffMember" (
  "id"        UUID NOT NULL,
  "name"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "bio"       TEXT,
  "avatarUrl" TEXT,
  "link"      TEXT,
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffMember_isActive_sortOrder_idx" ON "StaffMember"("isActive", "sortOrder");
