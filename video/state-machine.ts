import { VideoDigestStatus } from "@prisma/client";
import { VideoDigestError } from "@/video/errors";

const transitions: Record<VideoDigestStatus, readonly VideoDigestStatus[]> = {
  [VideoDigestStatus.QUEUED]: [VideoDigestStatus.GENERATING, VideoDigestStatus.CANCELLED],
  [VideoDigestStatus.GENERATING]: [
    VideoDigestStatus.READY,
    VideoDigestStatus.GENERATION_FAILED,
    VideoDigestStatus.CANCELLED
  ],
  [VideoDigestStatus.GENERATION_FAILED]: [VideoDigestStatus.GENERATING, VideoDigestStatus.CANCELLED],
  [VideoDigestStatus.READY]: [VideoDigestStatus.GENERATING, VideoDigestStatus.SENDING, VideoDigestStatus.CANCELLED],
  [VideoDigestStatus.SENDING]: [VideoDigestStatus.SENT, VideoDigestStatus.SEND_FAILED],
  [VideoDigestStatus.SEND_FAILED]: [
    VideoDigestStatus.SENDING,
    VideoDigestStatus.GENERATING,
    VideoDigestStatus.CANCELLED
  ],
  [VideoDigestStatus.SENT]: [],
  [VideoDigestStatus.CANCELLED]: []
};

export const OPEN_VIDEO_DIGEST_STATUSES: VideoDigestStatus[] = [
  VideoDigestStatus.QUEUED,
  VideoDigestStatus.GENERATING,
  VideoDigestStatus.READY,
  VideoDigestStatus.SENDING,
  VideoDigestStatus.SEND_FAILED,
  VideoDigestStatus.GENERATION_FAILED
];

export function canTransitionVideoDigest(from: VideoDigestStatus, to: VideoDigestStatus) {
  return transitions[from].includes(to);
}

export function assertVideoDigestTransition(from: VideoDigestStatus, to: VideoDigestStatus) {
  if (!canTransitionVideoDigest(from, to)) {
    throw new VideoDigestError(
      "VIDEO_DIGEST_INVALID_STATE",
      `No se puede cambiar el video de ${from} a ${to}.`
    );
  }
}
