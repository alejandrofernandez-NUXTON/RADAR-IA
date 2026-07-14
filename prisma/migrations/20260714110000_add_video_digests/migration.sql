-- CreateEnum
CREATE TYPE "TelegramMessageKind" AS ENUM ('news_text', 'video_digest');

-- CreateEnum
CREATE TYPE "VideoDigestStatus" AS ENUM (
  'queued',
  'generating',
  'ready',
  'sending',
  'sent',
  'generation_failed',
  'send_failed',
  'cancelled'
);

-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN "videoDigestReservationId" TEXT;

-- AlterTable
ALTER TABLE "TelegramMessage"
  ADD COLUMN "kind" "TelegramMessageKind" NOT NULL DEFAULT 'news_text',
  ADD COLUMN "videoDigestId" TEXT,
  ADD COLUMN "telegramMessageId" TEXT,
  ADD COLUMN "deliveryUncertain" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VideoDigest" (
  "id" TEXT NOT NULL,
  "status" "VideoDigestStatus" NOT NULL DEFAULT 'queued',
  "title" TEXT,
  "language" TEXT NOT NULL DEFAULT 'es-ES',
  "targetDurationSeconds" INTEGER NOT NULL DEFAULT 150,
  "inputHash" TEXT NOT NULL,
  "script" JSONB,
  "timeline" JSONB,
  "renderMetadata" JSONB,
  "videoStorageKey" TEXT,
  "thumbnailStorageKey" TEXT,
  "subtitleStorageKey" TEXT,
  "durationSeconds" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "fps" INTEGER,
  "sizeBytes" BIGINT,
  "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  "sendAttempts" INTEGER NOT NULL DEFAULT 0,
  "deliveryUncertain" BOOLEAN NOT NULL DEFAULT false,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "generatedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VideoDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoDigestItem" (
  "id" TEXT NOT NULL,
  "videoDigestId" TEXT NOT NULL,
  "newsItemId" TEXT,
  "position" INTEGER NOT NULL,
  "contentSnapshot" JSONB NOT NULL,
  "sourceRevisionHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsItem_videoDigestReservationId_idx" ON "NewsItem"("videoDigestReservationId");
CREATE INDEX "TelegramMessage_videoDigestId_status_idx" ON "TelegramMessage"("videoDigestId", "status");
CREATE INDEX "TelegramMessage_kind_status_idx" ON "TelegramMessage"("kind", "status");
CREATE INDEX "VideoDigest_status_createdAt_idx" ON "VideoDigest"("status", "createdAt");
CREATE INDEX "VideoDigest_createdAt_idx" ON "VideoDigest"("createdAt");
CREATE UNIQUE INDEX "VideoDigestItem_videoDigestId_position_key" ON "VideoDigestItem"("videoDigestId", "position");
CREATE UNIQUE INDEX "VideoDigestItem_videoDigestId_newsItemId_key" ON "VideoDigestItem"("videoDigestId", "newsItemId");
CREATE INDEX "VideoDigestItem_newsItemId_idx" ON "VideoDigestItem"("newsItemId");

-- AddForeignKey
ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_videoDigestReservationId_fkey"
  FOREIGN KEY ("videoDigestReservationId") REFERENCES "VideoDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_videoDigestId_fkey"
  FOREIGN KEY ("videoDigestId") REFERENCES "VideoDigest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VideoDigestItem" ADD CONSTRAINT "VideoDigestItem_videoDigestId_fkey"
  FOREIGN KEY ("videoDigestId") REFERENCES "VideoDigest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoDigestItem" ADD CONSTRAINT "VideoDigestItem_newsItemId_fkey"
  FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Telegram video uploads are represented by one digest message, never one message per news item.
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_target_check" CHECK (
  ("kind" = 'news_text' AND "videoDigestId" IS NULL)
  OR
  ("kind" = 'video_digest' AND "videoDigestId" IS NOT NULL AND "newsItemId" IS NULL)
);
