import { describe, expect, it } from "vitest";
import { NewsStatus, RecommendedAction, type NewsItem, type Source, SourceType } from "@prisma/client";
import { createNewsSnapshot, digestInputHash, newsSnapshotSchema, sourceRevisionHash } from "@/video/schemas/news-snapshot-schema";
import { videoScriptSchema } from "@/video/schemas/video-script-schema";
import { createDemoScript } from "@/video/services/video-script-service";
import { timelineToSrt } from "@/video/services/subtitle-service";
import type { NarrationTrack } from "@/video/types/video-types";
import { buildTimeline } from "@/video/utils/timing";

function news(overrides: Partial<NewsItem> = {}) {
  const source: Source = {
    id: "source-1",
    name: "Canal IA",
    type: SourceType.YOUTUBE_VIDEO,
    url: "https://www.youtube.com/watch?v=abc123",
    category: "IA",
    language: "es",
    priority: 1,
    active: true,
    lastProcessedAt: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z")
  };
  const item = {
    id: "news-1",
    sourceId: source.id,
    sourceUrl: source.url,
    contentHash: "hash",
    externalId: "abc123",
    title: "Una novedad util",
    shortSummary: "Resumen ejecutivo",
    longSummary: "Resumen largo y detallado",
    keyPoints: ["Punto uno"],
    whyItMatters: "Reduce tiempo operativo",
    businessApplications: ["Piloto interno"],
    toolsMentioned: ["Gemini"],
    companiesMentioned: ["Google"],
    categories: ["modelos"],
    tags: ["ia"],
    noveltyScore: 80,
    relevanceScore: 90,
    practicalityScore: 85,
    urgencyScore: 70,
    overallScore: 84,
    recommendedAction: RecommendedAction.PUBLISH,
    telegramWorthy: true,
    featured: false,
    status: NewsStatus.PUBLISHED,
    publishedAt: new Date("2026-01-02T00:00:00Z"),
    sentToTelegramAt: null,
    rawGeminiResponse: null,
    rawSourceMetadata: {},
    videoDigestReservationId: null,
    createdAt: new Date("2026-01-02T00:00:00Z"),
    updatedAt: new Date("2026-01-03T00:00:00Z"),
    ...overrides,
    source
  };
  return item as NewsItem & { source: Source };
}

describe("video snapshots", () => {
  it("captures the complete editorial content and source", () => {
    const snapshot = createNewsSnapshot(news());
    expect(snapshot.newsItemId).toBe("news-1");
    expect(snapshot.businessApplications).toEqual(["Piloto interno"]);
    expect(snapshot.source.name).toBe("Canal IA");
    expect(snapshot.scores.overall).toBe(84);
  });

  it("derives the YouTube thumbnail when metadata has none", () => {
    expect(createNewsSnapshot(news()).source.thumbnailUrl).toContain("abc123");
  });

  it("prefers a source thumbnail from metadata", () => {
    const snapshot = createNewsSnapshot(news({ rawSourceMetadata: { thumbnailUrl: "https://cdn.example.com/image.jpg" } }));
    expect(snapshot.source.thumbnailUrl).toBe("https://cdn.example.com/image.jpg");
  });

  it("keeps audit timestamps out of the revision hash", () => {
    const first = createNewsSnapshot(news());
    const second = { ...first, updatedAt: "2026-04-01T00:00:00.000Z" };
    expect(sourceRevisionHash(first)).toBe(sourceRevisionHash(second));
  });

  it("detects meaningful content changes", () => {
    const first = createNewsSnapshot(news());
    const second = { ...first, shortSummary: "Contenido editorial cambiado" };
    expect(sourceRevisionHash(first)).not.toBe(sourceRevisionHash(second));
  });

  it("makes the digest input hash order-sensitive", () => {
    expect(digestInputHash(["a", "b"])).not.toBe(digestInputHash(["b", "a"]));
    expect(digestInputHash(["a", "b"])).toBe(digestInputHash(["a", "b"]));
  });

  it("rejects malformed scores", () => {
    const snapshot = createNewsSnapshot(news());
    expect(newsSnapshotSchema.safeParse({ ...snapshot, scores: { ...snapshot.scores, overall: 101 } }).success).toBe(false);
  });
});

describe("script, timeline and subtitles", () => {
  it("accepts the deterministic demo script", () => {
    expect(videoScriptSchema.parse(createDemoScript()).scenes).toHaveLength(2);
  });

  it("rejects titles that cannot fit the design", () => {
    const script = createDemoScript();
    expect(videoScriptSchema.safeParse({ ...script, title: "x".repeat(141) }).success).toBe(false);
  });

  it("builds one timed segment per narration plus sources", () => {
    const script = createDemoScript();
    const tracks: NarrationTrack[] = [
      { id: "intro", relativeFile: "audio/intro.wav", absolutePath: "intro.wav", durationSeconds: 3, text: script.introduction.narration },
      ...script.scenes.map((scene) => ({ id: scene.id, newsItemId: scene.newsItemId, relativeFile: `audio/${scene.id}.wav`, absolutePath: `${scene.id}.wav`, durationSeconds: 4, text: scene.narration })),
      { id: "conclusion", relativeFile: "audio/end.wav", absolutePath: "end.wav", durationSeconds: 3, text: script.conclusion.narration }
    ];
    const timeline = buildTimeline(script, tracks, 30);
    expect(timeline.segments).toHaveLength(script.scenes.length + 3);
    expect(timeline.segments.at(-1)?.kind).toBe("sources");
    expect(timeline.totalDurationSeconds).toBeGreaterThan(10);
  });

  it("writes valid SRT timestamps", () => {
    const script = createDemoScript();
    const tracks: NarrationTrack[] = [
      { id: "intro", relativeFile: "audio/intro.wav", absolutePath: "intro.wav", durationSeconds: 3, text: script.introduction.narration },
      ...script.scenes.map((scene) => ({ id: scene.id, relativeFile: `audio/${scene.id}.wav`, absolutePath: `${scene.id}.wav`, durationSeconds: 4, text: scene.narration })),
      { id: "conclusion", relativeFile: "audio/end.wav", absolutePath: "end.wav", durationSeconds: 3, text: script.conclusion.narration }
    ];
    expect(timelineToSrt(buildTimeline(script, tracks, 30))).toMatch(/00:00:00,000 --> 00:00:/);
  });
});
