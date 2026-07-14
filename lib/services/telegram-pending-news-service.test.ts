import { describe, expect, it } from "vitest";
import { NewsStatus, TelegramStatus } from "@prisma/client";
import { pendingTelegramOrder, pendingTelegramWhere } from "@/lib/services/telegram-pending-news-service";

describe("pending Telegram news definition", () => {
  const where = pendingTelegramWhere(82);

  it("only accepts editorially published NewsItem records", () => {
    expect(where.status).toBe(NewsStatus.PUBLISHED);
    expect(where.status).not.toBe(NewsStatus.REVIEW);
  });

  it("cannot accidentally select CollectedSourceItem.PENDING", () => {
    expect(where).not.toHaveProperty("collectedItems");
    expect(where.status).not.toBe("PENDING");
  });

  it("requires explicit Telegram worthiness", () => {
    expect(where.telegramWorthy).toBe(true);
  });

  it("uses the configured score threshold", () => {
    expect(where.overallScore).toEqual({ gte: 82 });
    expect(pendingTelegramWhere(70).overallScore).toEqual({ gte: 70 });
  });

  it("excludes news with a delivery timestamp", () => {
    expect(where.sentToTelegramAt).toBeNull();
  });

  it("excludes all active video reservations", () => {
    expect(where.videoDigestReservationId).toBeNull();
  });

  it("excludes any prior successful individual delivery", () => {
    expect(where.telegramMessages).toEqual({ none: { status: TelegramStatus.SENT } });
  });

  it("uses oldest-first deterministic ordering with stable tie-breakers", () => {
    expect(pendingTelegramOrder).toEqual([{ createdAt: "asc" }, { overallScore: "desc" }, { id: "asc" }]);
  });
});
