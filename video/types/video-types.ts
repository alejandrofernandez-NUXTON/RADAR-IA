import { z } from "zod";
import { videoScriptSchema } from "../schemas/video-script-schema";

export const captionCueSchema = z.object({
  startSeconds: z.number().min(0),
  endSeconds: z.number().positive(),
  text: z.string().min(1)
});

export const timelineSegmentSchema = z.object({
  id: z.string(),
  kind: z.enum(["intro", "news", "conclusion", "sources"]),
  newsItemId: z.string().optional(),
  startSeconds: z.number().min(0),
  durationSeconds: z.number().positive(),
  audioFile: z.string().optional(),
  imageFile: z.string().optional(),
  title: z.string(),
  narration: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  sourceLabel: z.string().optional(),
  sourceUrl: z.string().optional()
});

export const videoTimelineSchema = z.object({
  version: z.literal("1.0"),
  fps: z.number().int().positive(),
  totalDurationSeconds: z.number().positive(),
  segments: z.array(timelineSegmentSchema).min(1),
  captions: z.array(captionCueSchema)
});

export const videoRenderPropsSchema = z.object({
  script: videoScriptSchema,
  timeline: videoTimelineSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  generatedDate: z.string()
});

export type CaptionCue = z.infer<typeof captionCueSchema>;
export type TimelineSegment = z.infer<typeof timelineSegmentSchema>;
export type VideoTimeline = z.infer<typeof videoTimelineSchema>;
export type VideoRenderProps = z.infer<typeof videoRenderPropsSchema>;

export type TtsResult = {
  outputPath: string;
  durationSeconds: number;
  mimeType: string;
  provider: string;
  model?: string;
};

export type NarrationTrack = {
  id: string;
  newsItemId?: string;
  relativeFile: string;
  absolutePath: string;
  durationSeconds: number;
  text: string;
};
