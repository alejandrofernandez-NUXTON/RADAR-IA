import type { Source } from "@prisma/client";

export type SourceContent = {
  source: Source;
  sourceUrl: string;
  externalId?: string;
  title: string;
  author?: string;
  description?: string;
  transcript?: string;
  publishedAt?: Date;
  rawMetadata?: Record<string, unknown>;
};

export type TrainingCandidate = {
  title: string;
  description: string;
  url: string;
  provider: string;
  contentType: "video" | "course" | "tutorial" | "playlist" | "article" | "documentation";
  estimatedDuration?: string;
  level?: "beginner" | "intermediate" | "advanced";
  topics?: string[];
  language?: string;
  isFree?: boolean;
  publishedAt?: Date;
};

export type JobResult = {
  processedCount: number;
  successCount: number;
  failedCount: number;
  metadata?: Record<string, unknown>;
};
