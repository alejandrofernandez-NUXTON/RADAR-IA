import { describe, expect, it } from "vitest";
import { shouldAutoGenerateVideo, shouldAutoSendReadyVideo } from "@/lib/services/video-automation-policy";

const active = {
  deliveryMode: "video_digest_manual" as const,
  videoEnabled: true,
  autoGenerateAfterProcessing: true,
  autoSendOnSchedule: true
};

describe("video automation policy", () => {
  it("chains video generation only in video delivery mode", () => {
    expect(shouldAutoGenerateVideo(active)).toBe(true);
    expect(shouldAutoGenerateVideo({ ...active, deliveryMode: "legacy_individual" })).toBe(false);
  });

  it("requires video generation and the generation toggle", () => {
    expect(shouldAutoGenerateVideo({ ...active, videoEnabled: false })).toBe(false);
    expect(shouldAutoGenerateVideo({ ...active, autoGenerateAfterProcessing: false })).toBe(false);
  });

  it("requires the explicit schedule toggle before automatic delivery", () => {
    expect(shouldAutoSendReadyVideo(active)).toBe(true);
    expect(shouldAutoSendReadyVideo({ ...active, autoSendOnSchedule: false })).toBe(false);
  });
});
