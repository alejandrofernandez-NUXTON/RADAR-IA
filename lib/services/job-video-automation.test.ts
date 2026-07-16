import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobCreate: vi.fn(),
  jobUpdate: vi.fn(),
  process: vi.fn(),
  generate: vi.fn(),
  getAll: vi.fn(),
  finishCancellation: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { jobRun: { create: mocks.jobCreate, update: mocks.jobUpdate } }
}));
vi.mock("@/lib/services/settings-service", () => ({ SettingsService: { getAll: mocks.getAll } }));
vi.mock("@/lib/services/news-analysis-service", () => ({
  NewsAnalysisService: class { processPendingCollectedItems = mocks.process; }
}));
vi.mock("@/lib/services/training-search-service", () => ({ TrainingSearchService: class {} }));
vi.mock("@/lib/services/video-digest-service", () => ({
  VideoDigestService: class { generateFromPendingNews = mocks.generate; }
}));
vi.mock("@/lib/services/job-runtime-service", () => ({
  JobRuntimeService: { start: vi.fn(), progress: vi.fn(), finish: vi.fn() }
}));
vi.mock("@/lib/services/job-cancellation-service", () => ({
  JobCancelledError: class extends Error {},
  JobCancellationService: {
    register: () => ({
      signal: new AbortController().signal,
      throwIfCancelled: vi.fn(),
      finish: mocks.finishCancellation
    })
  }
}));

import { JobService } from "@/lib/services/job-service";

const processingResult = { processedCount: 2, successCount: 2, failedCount: 0, metadata: { pendingCount: 2 } };
const videoResult = { processedCount: 2, successCount: 2, failedCount: 0, metadata: { digestId: "digest-1" } };

describe("OpenAI to video job chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobCreate.mockResolvedValue({ id: "job-1" });
    mocks.jobUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "job-1", ...data }));
    mocks.process.mockResolvedValue(processingResult);
    mocks.generate.mockResolvedValue(videoResult);
    mocks.getAll.mockResolvedValue({
      telegramDeliveryMode: "video_digest_manual",
      video: { enabled: true, autoGenerateAfterProcessing: true, autoSendOnSchedule: true }
    });
  });

  it("generates a video automatically after OpenAI processing", async () => {
    await new JobService().runNewsProcessingJob();
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.jobUpdate.mock.calls[0][0].data.metadata).toMatchObject({
      videoAutoGeneration: true,
      video: { digestId: "digest-1" }
    });
  });

  it("preserves processing-only behavior when the toggle is disabled", async () => {
    mocks.getAll.mockResolvedValue({
      telegramDeliveryMode: "video_digest_manual",
      video: { enabled: true, autoGenerateAfterProcessing: false, autoSendOnSchedule: true }
    });
    await new JobService().runNewsProcessingJob();
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
