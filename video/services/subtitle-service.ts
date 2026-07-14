import type { CaptionCue, TimelineSegment, VideoTimeline } from "@/video/types/video-types";

function splitCaptionText(text: string, wordsPerCue = 9) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += wordsPerCue) {
    chunks.push(words.slice(index, index + wordsPerCue).join(" "));
  }
  return chunks;
}

export function createCaptionCues(segments: TimelineSegment[]): CaptionCue[] {
  return segments.flatMap((segment) => {
    if (!segment.narration || !segment.audioFile) return [];
    const chunks = splitCaptionText(segment.narration);
    if (!chunks.length) return [];
    const spokenDuration = Math.max(0.5, segment.durationSeconds - 0.35);
    const cueDuration = spokenDuration / chunks.length;
    return chunks.map((text, index) => ({
      startSeconds: segment.startSeconds + index * cueDuration,
      endSeconds: segment.startSeconds + Math.min(spokenDuration, (index + 1) * cueDuration),
      text
    }));
  });
}

function srtTime(seconds: number) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function timelineToSrt(timeline: VideoTimeline) {
  return timeline.captions
    .map((cue, index) => `${index + 1}\n${srtTime(cue.startSeconds)} --> ${srtTime(cue.endSeconds)}\n${cue.text}\n`)
    .join("\n");
}
