CREATE TYPE "SourceType" AS ENUM ('youtube_video', 'youtube_channel', 'youtube_playlist', 'rss_feed', 'website', 'newsletter_manual');
CREATE TYPE "NewsStatus" AS ENUM ('draft', 'review', 'published', 'discarded', 'sent_to_telegram', 'error');
CREATE TYPE "TrainingStatus" AS ENUM ('review', 'published', 'discarded', 'featured');
CREATE TYPE "TelegramStatus" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "JobStatus" AS ENUM ('running', 'success', 'failed', 'partial');
CREATE TYPE "RecommendedAction" AS ENUM ('publish', 'review', 'discard');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
  "key" TEXT NOT NULL,
  "value" TEXT,
  "isSecret" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Source" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "SourceType" NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'es',
  "priority" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastProcessedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewsItem" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceUrl" TEXT NOT NULL,
  "contentHash" TEXT,
  "externalId" TEXT,
  "title" TEXT NOT NULL,
  "shortSummary" TEXT NOT NULL,
  "longSummary" TEXT NOT NULL,
  "keyPoints" JSONB NOT NULL DEFAULT '[]',
  "whyItMatters" TEXT NOT NULL,
  "businessApplications" JSONB NOT NULL DEFAULT '[]',
  "toolsMentioned" JSONB NOT NULL DEFAULT '[]',
  "companiesMentioned" JSONB NOT NULL DEFAULT '[]',
  "categories" JSONB NOT NULL DEFAULT '[]',
  "tags" JSONB NOT NULL DEFAULT '[]',
  "noveltyScore" INTEGER NOT NULL DEFAULT 0,
  "relevanceScore" INTEGER NOT NULL DEFAULT 0,
  "practicalityScore" INTEGER NOT NULL DEFAULT 0,
  "urgencyScore" INTEGER NOT NULL DEFAULT 0,
  "overallScore" INTEGER NOT NULL DEFAULT 0,
  "recommendedAction" "RecommendedAction" NOT NULL DEFAULT 'review',
  "telegramWorthy" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "status" "NewsStatus" NOT NULL DEFAULT 'review',
  "publishedAt" TIMESTAMP(3),
  "sentToTelegramAt" TIMESTAMP(3),
  "rawGeminiResponse" JSONB,
  "rawSourceMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingItem" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "estimatedDuration" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "topics" JSONB NOT NULL DEFAULT '[]',
  "qualityScore" INTEGER NOT NULL DEFAULT 0,
  "practicalityScore" INTEGER NOT NULL DEFAULT 0,
  "freshnessScore" INTEGER NOT NULL DEFAULT 0,
  "overallScore" INTEGER NOT NULL DEFAULT 0,
  "whyRecommended" TEXT NOT NULL,
  "isFree" BOOLEAN NOT NULL DEFAULT true,
  "language" TEXT NOT NULL DEFAULT 'es',
  "status" "TrainingStatus" NOT NULL DEFAULT 'review',
  "internalNote" TEXT,
  "rawEvaluation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramMessage" (
  "id" TEXT NOT NULL,
  "newsItemId" TEXT,
  "chatId" TEXT NOT NULL,
  "messageText" TEXT NOT NULL,
  "telegramResponse" JSONB,
  "status" "TelegramStatus" NOT NULL DEFAULT 'pending',
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobRun" (
  "id" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'running',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "processedCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "metadata" JSONB,
  CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogEntry" (
  "id" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Source_url_key" ON "Source"("url");
CREATE INDEX "Source_active_priority_idx" ON "Source"("active", "priority");
CREATE INDEX "Source_type_idx" ON "Source"("type");
CREATE UNIQUE INDEX "NewsItem_contentHash_key" ON "NewsItem"("contentHash");
CREATE UNIQUE INDEX "NewsItem_sourceId_sourceUrl_key" ON "NewsItem"("sourceId", "sourceUrl");
CREATE INDEX "NewsItem_status_overallScore_idx" ON "NewsItem"("status", "overallScore");
CREATE INDEX "NewsItem_createdAt_idx" ON "NewsItem"("createdAt");
CREATE UNIQUE INDEX "TrainingItem_url_key" ON "TrainingItem"("url");
CREATE INDEX "TrainingItem_status_overallScore_idx" ON "TrainingItem"("status", "overallScore");
CREATE INDEX "TrainingItem_provider_idx" ON "TrainingItem"("provider");
CREATE INDEX "TelegramMessage_newsItemId_status_idx" ON "TelegramMessage"("newsItemId", "status");
CREATE INDEX "TelegramMessage_status_idx" ON "TelegramMessage"("status");
CREATE INDEX "JobRun_jobType_startedAt_idx" ON "JobRun"("jobType", "startedAt");
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");
CREATE INDEX "LogEntry_level_createdAt_idx" ON "LogEntry"("level", "createdAt");
CREATE INDEX "LogEntry_scope_createdAt_idx" ON "LogEntry"("scope", "createdAt");

ALTER TABLE "NewsItem" ADD CONSTRAINT "NewsItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
