-- CreateTable
CREATE TABLE "RetiredEgg" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredEgg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetiredEgg_slug_key" ON "RetiredEgg"("slug");
