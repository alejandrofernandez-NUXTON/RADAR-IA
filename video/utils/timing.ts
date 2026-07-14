import type { NarrationTrack, TimelineSegment, VideoTimeline } from "@/video/types/video-types";
import type { VideoScript } from "@/video/schemas/video-script-schema";
import { createCaptionCues } from "@/video/services/subtitle-service";

const GAP_SECONDS = 0.35;
const SOURCES_SECONDS = 5;

export function buildTimeline(script: VideoScript, tracks: NarrationTrack[], fps: number): VideoTimeline {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const segments: TimelineSegment[] = [];
  let cursor = 0;

  const intro = byId.get("intro");
  if (!intro) throw new Error("Falta la narracion de introduccion.");
  segments.push({
    id: "intro",
    kind: "intro",
    startSeconds: cursor,
    durationSeconds: intro.durationSeconds + GAP_SECONDS,
    audioFile: intro.relativeFile,
    title: script.introduction.onScreenTitle,
    narration: intro.text,
    bullets: script.introduction.onScreenText ? [script.introduction.onScreenText] : []
  });
  cursor += intro.durationSeconds + GAP_SECONDS;

  for (const scene of [...script.scenes].sort((a, b) => a.order - b.order)) {
    const track = byId.get(scene.id);
    if (!track) throw new Error(`Falta la narracion de la escena ${scene.id}.`);
    segments.push({
      id: scene.id,
      kind: "news",
      newsItemId: scene.newsItemId,
      startSeconds: cursor,
      durationSeconds: track.durationSeconds + GAP_SECONDS,
      audioFile: track.relativeFile,
      title: scene.title,
      narration: track.text,
      bullets: scene.onScreenBullets,
      sourceLabel: scene.sourceLabel,
      sourceUrl: scene.sourceUrl
    });
    cursor += track.durationSeconds + GAP_SECONDS;
  }

  const conclusion = byId.get("conclusion");
  if (!conclusion) throw new Error("Falta la narracion de conclusion.");
  segments.push({
    id: "conclusion",
    kind: "conclusion",
    startSeconds: cursor,
    durationSeconds: conclusion.durationSeconds + GAP_SECONDS,
    audioFile: conclusion.relativeFile,
    title: script.conclusion.onScreenTitle,
    narration: conclusion.text,
    bullets: script.conclusion.onScreenBullets
  });
  cursor += conclusion.durationSeconds + GAP_SECONDS;

  segments.push({
    id: "sources",
    kind: "sources",
    startSeconds: cursor,
    durationSeconds: SOURCES_SECONDS,
    title: "Fuentes",
    bullets: script.sources.map((source) => `${source.name}: ${source.title}`)
  });
  cursor += SOURCES_SECONDS;

  return {
    version: "1.0",
    fps,
    totalDurationSeconds: Math.ceil(cursor * fps) / fps,
    segments,
    captions: createCaptionCues(segments)
  };
}

export function secondsToFrames(seconds: number, fps: number) {
  return Math.max(1, Math.round(seconds * fps));
}
