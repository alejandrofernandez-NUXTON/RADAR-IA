import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsStatus, TelegramMessageKind, VideoDigestStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  digestFindUnique: vi.fn(),
  digestUpdateMany: vi.fn(),
  txDigestUpdateMany: vi.fn(),
  messageCreate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageUpdate: vi.fn(),
  newsFindUnique: vi.fn(),
  newsUpdateMany: vi.fn(),
  newsUpdate: vi.fn(),
  transaction: vi.fn(),
  assertSendable: vi.fn(),
  listEligible: vi.fn(),
  storageCreate: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    videoDigest: { findUnique: mocks.digestFindUnique, updateMany: mocks.digestUpdateMany },
    telegramMessage: { create: mocks.messageCreate, findFirst: mocks.messageFindFirst, update: mocks.messageUpdate },
    newsItem: { findUnique: mocks.newsFindUnique, updateMany: mocks.newsUpdateMany, update: mocks.newsUpdate },
    $transaction: mocks.transaction
  }
}));

vi.mock("@/lib/services/settings-service", () => ({ SettingsService: { getAll: mocks.getAll } }));
vi.mock("@/lib/services/telegram-pending-news-service", () => ({
  TelegramPendingNewsService: class {
    assertDigestStillSendable = mocks.assertSendable;
    listEligibleNews = mocks.listEligible;
  }
}));
vi.mock("@/video/services/video-storage-service", () => ({
  LocalVideoStorageProvider: { create: mocks.storageCreate }
}));
vi.mock("@/lib/services/log-service", () => ({
  LogService: { info: mocks.logInfo, error: mocks.logError, warn: mocks.logWarn }
}));

import { TelegramService } from "@/lib/services/telegram-service";

const testDirectory = path.resolve(process.cwd(), "data/video-service-tests");
const testVideo = path.join(testDirectory, "video.mp4");

const baseSettings = {
  telegramBotToken: "test-token",
  telegramChatId: "-1001",
  telegramDeliveryMode: "video_digest_manual",
  telegramEnabled: true,
  telegramTemplate: "{title} {sourceUrl} {tags}"
};

function digest(overrides: Record<string, unknown> = {}) {
  return {
    id: "digest-1",
    status: VideoDigestStatus.READY,
    deliveryUncertain: false,
    videoStorageKey: "digest-1/video.mp4",
    width: 1920,
    height: 1080,
    durationSeconds: 90,
    items: [{ id: "item-1" }, { id: "item-2" }],
    ...overrides
  };
}

describe("manual Telegram video delivery", () => {
  beforeAll(async () => {
    await mkdir(testDirectory, { recursive: true });
    await writeFile(testVideo, Buffer.from("test-video"));
  });

  afterAll(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAll.mockResolvedValue(baseSettings);
    mocks.digestFindUnique.mockResolvedValue(digest());
    mocks.digestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txDigestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageCreate.mockResolvedValue({ id: "message-1" });
    mocks.messageUpdate.mockResolvedValue({ id: "message-1" });
    mocks.newsUpdateMany.mockResolvedValue({ count: 2 });
    mocks.assertSendable.mockResolvedValue(digest());
    mocks.listEligible.mockResolvedValue([]);
    mocks.storageCreate.mockResolvedValue({ open: vi.fn().mockResolvedValue({ absolutePath: testVideo, size: 10_000 }) });
    mocks.logInfo.mockResolvedValue(undefined);
    mocks.logError.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      if (typeof operation === "function") {
        return operation({
          telegramMessage: { update: mocks.messageUpdate },
          videoDigest: { updateMany: mocks.txDigestUpdateMany },
          newsItem: { updateMany: mocks.newsUpdateMany }
        });
      }
      return operation;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
  });

  it("creates one VIDEO_DIGEST TelegramMessage for the whole batch", async () => {
    await new TelegramService().sendVideoDigest("digest-1");
    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.messageCreate.mock.calls[0][0].data.kind).toBe(TelegramMessageKind.VIDEO_DIGEST);
    expect(mocks.messageCreate.mock.calls[0][0].data.newsItemId).toBeUndefined();
  });

  it("marks the digest and all expected news only after Telegram success", async () => {
    const result = await new TelegramService().sendVideoDigest("digest-1");
    expect(result.telegramMessageId).toBe("77");
    expect(mocks.txDigestUpdateMany.mock.calls[0][0].data.status).toBe(VideoDigestStatus.SENT);
    expect(mocks.newsUpdateMany.mock.calls[0][0].data.status).toBe(NewsStatus.SENT_TO_TELEGRAM);
    expect(mocks.newsUpdateMany.mock.calls[0][0].data.videoDigestReservationId).toBeNull();
  });

  it("keeps news untouched when Telegram confirms an upload error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: "Bad Request" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        })
      )
    );
    await expect(new TelegramService().sendVideoDigest("digest-1")).rejects.toMatchObject({ code: "TELEGRAM_VIDEO_UPLOAD_ERROR" });
    expect(mocks.newsUpdateMany).not.toHaveBeenCalled();
    expect(mocks.txDigestUpdateMany.mock.calls.at(-1)?.[0].data.status).toBe(VideoDigestStatus.SEND_FAILED);
  });

  it("marks network timeouts as uncertain instead of retrying blindly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket timeout")));
    await expect(new TelegramService().sendVideoDigest("digest-1")).rejects.toMatchObject({ code: "TELEGRAM_VIDEO_DELIVERY_UNCERTAIN" });
    expect(mocks.newsUpdateMany).not.toHaveBeenCalled();
    expect(mocks.txDigestUpdateMany.mock.calls.at(-1)?.[0].data.deliveryUncertain).toBe(true);
  });

  it("makes concurrent double-clicks a no-op after the atomic state acquisition", async () => {
    mocks.digestUpdateMany.mockResolvedValue({ count: 0 });
    await expect(new TelegramService().sendVideoDigest("digest-1")).resolves.toEqual({ skipped: true, reason: "already_sending" });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never sends a digest already marked SENT", async () => {
    mocks.digestFindUnique.mockResolvedValue(digest({ status: VideoDigestStatus.SENT }));
    await expect(new TelegramService().sendVideoDigest("digest-1")).resolves.toEqual({ skipped: true, reason: "already_sent" });
    expect(mocks.storageCreate).not.toHaveBeenCalled();
  });

  it("blocks retries while a previous result remains uncertain", async () => {
    mocks.digestFindUnique.mockResolvedValue(digest({ status: VideoDigestStatus.SEND_FAILED, deliveryUncertain: true }));
    await expect(new TelegramService().sendVideoDigest("digest-1")).rejects.toMatchObject({ code: "TELEGRAM_VIDEO_DELIVERY_UNCERTAIN" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops before state acquisition when the MP4 is missing", async () => {
    mocks.storageCreate.mockResolvedValue({ open: vi.fn().mockRejectedValue(new Error("missing")) });
    await expect(new TelegramService().sendVideoDigest("digest-1")).rejects.toThrow("missing");
    expect(mocks.digestUpdateMany).not.toHaveBeenCalled();
  });

  it("blocks individual delivery for a reserved news item", async () => {
    mocks.newsFindUnique.mockResolvedValue({
      id: "news-1",
      videoDigestReservationId: "digest-1",
      sentToTelegramAt: null,
      status: NewsStatus.PUBLISHED
    });
    await expect(new TelegramService().sendNewsItem("news-1")).rejects.toThrow(/reservada por el video/);
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("skips mass individual delivery in video_digest_manual mode", async () => {
    const result = await new TelegramService().sendPending();
    expect(result.metadata).toEqual({ skipped: true, reason: "video_digest_manual" });
    expect(mocks.listEligible).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
