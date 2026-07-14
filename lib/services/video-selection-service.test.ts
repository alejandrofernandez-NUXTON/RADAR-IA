import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsStatus, RecommendedAction, SourceType, VideoDigestStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  transaction: vi.fn(),
  rootCount: vi.fn(),
  rootFindMany: vi.fn(),
  rootFindUnique: vi.fn(),
  rootUpdateMany: vi.fn(),
  executeRaw: vi.fn(),
  digestFindMany: vi.fn(),
  digestCreate: vi.fn(),
  digestUpdate: vi.fn(),
  newsFindMany: vi.fn(),
  newsCount: vi.fn(),
  newsUpdateMany: vi.fn(),
  itemCreateMany: vi.fn()
}));

vi.mock("@/lib/services/settings-service", () => ({ SettingsService: { getAll: mocks.getAll } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    newsItem: {
      count: mocks.rootCount,
      findMany: mocks.rootFindMany,
      findUnique: mocks.rootFindUnique,
      updateMany: mocks.rootUpdateMany
    }
  }
}));

import { TelegramPendingNewsService } from "@/lib/services/telegram-pending-news-service";

const source = {
  id: "source-1",
  name: "Fuente",
  type: SourceType.YOUTUBE_VIDEO,
  url: "https://youtube.com/watch?v=test",
  category: "IA",
  language: "es",
  priority: 1,
  active: true,
  lastProcessedAt: null,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z")
};

const candidate = {
  id: "news-1",
  sourceId: source.id,
  sourceUrl: source.url,
  contentHash: "hash",
  externalId: "test",
  title: "Noticia",
  shortSummary: "Resumen",
  longSummary: "Resumen largo",
  keyPoints: ["Punto"],
  whyItMatters: "Importa",
  businessApplications: ["Piloto"],
  toolsMentioned: [],
  companiesMentioned: [],
  categories: ["IA"],
  tags: ["ia"],
  noveltyScore: 80,
  relevanceScore: 90,
  practicalityScore: 80,
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
  source
};

const tx = {
  $executeRaw: mocks.executeRaw,
  videoDigest: { findMany: mocks.digestFindMany, create: mocks.digestCreate, update: mocks.digestUpdate },
  newsItem: { findMany: mocks.newsFindMany, count: mocks.newsCount, updateMany: mocks.newsUpdateMany },
  videoDigestItem: { createMany: mocks.itemCreateMany }
};

describe("transactional video selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAll.mockResolvedValue({
      telegramThreshold: 82,
      video: { maxNewsItems: 6, maxOpenDigests: 1, language: "es-ES", targetDurationSeconds: 150 }
    });
    mocks.transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.digestFindMany.mockResolvedValue([]);
    mocks.newsFindMany.mockResolvedValueOnce([candidate]).mockResolvedValueOnce([{ ...candidate, videoDigestReservationId: "digest-1" }]);
    mocks.newsCount.mockResolvedValue(1);
    mocks.digestCreate.mockResolvedValue({ id: "digest-1", status: VideoDigestStatus.QUEUED });
    mocks.newsUpdateMany.mockResolvedValue({ count: 1 });
    mocks.itemCreateMany.mockResolvedValue({ count: 1 });
    mocks.digestUpdate.mockResolvedValue({ id: "digest-1", status: VideoDigestStatus.QUEUED, inputHash: "input" });
  });

  it("claims all selected news before creating snapshots", async () => {
    const result = await new TelegramPendingNewsService().claimEligibleNewsForDigest();
    expect(result.kind).toBe("claimed");
    expect(mocks.newsUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { videoDigestReservationId: "digest-1" } }));
    expect(mocks.itemCreateMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("fails the transaction when another execution wins a reservation", async () => {
    mocks.newsUpdateMany.mockResolvedValue({ count: 0 });
    await expect(new TelegramPendingNewsService().claimEligibleNewsForDigest()).rejects.toMatchObject({ code: "NEWS_ALREADY_RESERVED" });
    expect(mocks.itemCreateMany).not.toHaveBeenCalled();
  });

  it("returns the existing open digest without creating another", async () => {
    mocks.digestFindMany.mockResolvedValue([{ id: "digest-open", status: VideoDigestStatus.READY }]);
    const result = await new TelegramPendingNewsService().claimEligibleNewsForDigest();
    expect(result).toMatchObject({ kind: "existing", digest: { id: "digest-open" } });
    expect(mocks.digestCreate).not.toHaveBeenCalled();
  });

  it("returns a no-op when there is no eligible news", async () => {
    mocks.newsFindMany.mockReset().mockResolvedValue([]);
    await expect(new TelegramPendingNewsService().claimEligibleNewsForDigest()).resolves.toEqual({ kind: "empty" });
    expect(mocks.digestCreate).not.toHaveBeenCalled();
  });

  it("serializes selection through a PostgreSQL advisory transaction lock", async () => {
    await new TelegramPendingNewsService().claimEligibleNewsForDigest();
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
  });

  it("releases reservations without changing editorial status", async () => {
    mocks.rootUpdateMany.mockResolvedValue({ count: 2 });
    await new TelegramPendingNewsService().releaseDigestReservations("digest-1");
    expect(mocks.rootUpdateMany).toHaveBeenCalledWith({
      where: { videoDigestReservationId: "digest-1" },
      data: { videoDigestReservationId: null }
    });
  });

  it("reports whether a news item is reserved", async () => {
    mocks.rootFindUnique.mockResolvedValue({ videoDigestReservationId: "digest-1" });
    await expect(new TelegramPendingNewsService().isNewsReservedForVideo("news-1")).resolves.toBe("digest-1");
  });
});
