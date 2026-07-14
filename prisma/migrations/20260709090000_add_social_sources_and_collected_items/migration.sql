ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'twitter_channel';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'tiktok_channel';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'instagram_channel';

CREATE TYPE "CollectedItemStatus" AS ENUM ('pending', 'processed', 'discarded', 'error');

CREATE TABLE "CollectedSourceItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "transcript" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rawMetadata" JSONB,
    "status" "CollectedItemStatus" NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectedSourceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectedSourceItem_contentHash_key" ON "CollectedSourceItem"("contentHash");
CREATE UNIQUE INDEX "CollectedSourceItem_sourceId_sourceUrl_key" ON "CollectedSourceItem"("sourceId", "sourceUrl");
CREATE INDEX "CollectedSourceItem_status_createdAt_idx" ON "CollectedSourceItem"("status", "createdAt");
CREATE INDEX "CollectedSourceItem_sourceId_createdAt_idx" ON "CollectedSourceItem"("sourceId", "createdAt");

ALTER TABLE "CollectedSourceItem" ADD CONSTRAINT "CollectedSourceItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
