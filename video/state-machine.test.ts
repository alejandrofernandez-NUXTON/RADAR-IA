import { describe, expect, it } from "vitest";
import { VideoDigestStatus } from "@prisma/client";
import { assertVideoDigestTransition, canTransitionVideoDigest, OPEN_VIDEO_DIGEST_STATUSES } from "@/video/state-machine";

describe("video digest state machine", () => {
  it.each([
    [VideoDigestStatus.QUEUED, VideoDigestStatus.GENERATING],
    [VideoDigestStatus.GENERATING, VideoDigestStatus.READY],
    [VideoDigestStatus.GENERATING, VideoDigestStatus.GENERATION_FAILED],
    [VideoDigestStatus.GENERATING, VideoDigestStatus.CANCELLED],
    [VideoDigestStatus.GENERATION_FAILED, VideoDigestStatus.GENERATING],
    [VideoDigestStatus.GENERATION_FAILED, VideoDigestStatus.CANCELLED],
    [VideoDigestStatus.READY, VideoDigestStatus.GENERATING],
    [VideoDigestStatus.READY, VideoDigestStatus.SENDING],
    [VideoDigestStatus.READY, VideoDigestStatus.CANCELLED],
    [VideoDigestStatus.SENDING, VideoDigestStatus.SENT],
    [VideoDigestStatus.SENDING, VideoDigestStatus.SEND_FAILED],
    [VideoDigestStatus.SEND_FAILED, VideoDigestStatus.SENDING],
    [VideoDigestStatus.SEND_FAILED, VideoDigestStatus.GENERATING],
    [VideoDigestStatus.SEND_FAILED, VideoDigestStatus.CANCELLED]
  ])("allows %s -> %s", (from, to) => {
    expect(canTransitionVideoDigest(from, to)).toBe(true);
    expect(() => assertVideoDigestTransition(from, to)).not.toThrow();
  });

  it.each([
    [VideoDigestStatus.SENT, VideoDigestStatus.SENDING],
    [VideoDigestStatus.SENT, VideoDigestStatus.GENERATING],
    [VideoDigestStatus.CANCELLED, VideoDigestStatus.SENDING],
    [VideoDigestStatus.CANCELLED, VideoDigestStatus.READY],
    [VideoDigestStatus.READY, VideoDigestStatus.SENT],
    [VideoDigestStatus.SENDING, VideoDigestStatus.CANCELLED]
  ])("rejects %s -> %s", (from, to) => {
    expect(canTransitionVideoDigest(from, to)).toBe(false);
    expect(() => assertVideoDigestTransition(from, to)).toThrow(/No se puede cambiar/);
  });

  it("treats failed digests as open until an administrator decides", () => {
    expect(OPEN_VIDEO_DIGEST_STATUSES).toContain(VideoDigestStatus.GENERATION_FAILED);
    expect(OPEN_VIDEO_DIGEST_STATUSES).toContain(VideoDigestStatus.SEND_FAILED);
    expect(OPEN_VIDEO_DIGEST_STATUSES).not.toContain(VideoDigestStatus.SENT);
    expect(OPEN_VIDEO_DIGEST_STATUSES).not.toContain(VideoDigestStatus.CANCELLED);
  });
});
