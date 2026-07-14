import { createHash } from "crypto";
import { z } from "zod";
import type { NewsItem, Source } from "@prisma/client";
import { asStringArray } from "@/lib/utils";

const scoreSchema = z.number().int().min(0).max(100);

export const newsSnapshotSchema = z.object({
  newsItemId: z.string().min(1),
  title: z.string().min(1),
  shortSummary: z.string(),
  longSummary: z.string(),
  keyPoints: z.array(z.string()),
  whyItMatters: z.string(),
  businessApplications: z.array(z.string()),
  toolsMentioned: z.array(z.string()),
  companiesMentioned: z.array(z.string()),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  scores: z.object({
    novelty: scoreSchema,
    relevance: scoreSchema,
    practicality: scoreSchema,
    urgency: scoreSchema,
    overall: scoreSchema
  }),
  source: z.object({
    name: z.string(),
    url: z.string().url(),
    publishedAt: z.string().nullable(),
    thumbnailUrl: z.string().url().nullable()
  }),
  updatedAt: z.string()
});

export type NewsSnapshot = z.infer<typeof newsSnapshotSchema>;

type SnapshotNews = NewsItem & { source: Source | null };

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function thumbnailFromMetadata(item: SnapshotNews) {
  const metadata = metadataObject(item.rawSourceMetadata);
  const direct = [metadata.thumbnailUrl, metadata.thumbnail, metadata.imageUrl, metadata.image].find(
    (value): value is string => typeof value === "string" && /^https:\/\//i.test(value)
  );
  if (direct) return direct;
  if (item.externalId && /(?:youtube\.com|youtu\.be)/i.test(item.sourceUrl)) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(item.externalId)}/hqdefault.jpg`;
  }
  return null;
}

export function createNewsSnapshot(item: SnapshotNews): NewsSnapshot {
  const metadata = metadataObject(item.rawSourceMetadata);
  const sourcePublishedAt =
    typeof metadata.publishedAt === "string"
      ? metadata.publishedAt
      : item.publishedAt?.toISOString() || item.createdAt.toISOString();

  return newsSnapshotSchema.parse({
    newsItemId: item.id,
    title: item.title,
    shortSummary: item.shortSummary,
    longSummary: item.longSummary,
    keyPoints: asStringArray(item.keyPoints),
    whyItMatters: item.whyItMatters,
    businessApplications: asStringArray(item.businessApplications),
    toolsMentioned: asStringArray(item.toolsMentioned),
    companiesMentioned: asStringArray(item.companiesMentioned),
    categories: asStringArray(item.categories),
    tags: asStringArray(item.tags),
    scores: {
      novelty: item.noveltyScore,
      relevance: item.relevanceScore,
      practicality: item.practicalityScore,
      urgency: item.urgencyScore,
      overall: item.overallScore
    },
    source: {
      name: item.source?.name || "Fuente original",
      url: item.sourceUrl,
      publishedAt: sourcePublishedAt,
      thumbnailUrl: thumbnailFromMetadata(item)
    },
    updatedAt: item.updatedAt.toISOString()
  });
}

export function sourceRevisionHash(snapshot: NewsSnapshot) {
  return createHash("sha256").update(JSON.stringify({ ...snapshot, updatedAt: undefined })).digest("hex");
}

export function digestInputHash(sourceHashes: string[]) {
  return createHash("sha256").update(sourceHashes.join("\n")).digest("hex");
}
