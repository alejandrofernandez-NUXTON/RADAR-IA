import { mkdir } from "fs/promises";
import path from "path";
import type { JobProgressReporter } from "@/lib/types";
import type { VideoScript } from "@/video/schemas/video-script-schema";
import type { NarrationTrack } from "@/video/types/video-types";
import type { TextToSpeechProvider } from "@/video/services/tts-provider";

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64) || "scene";
}

export class NarrationService {
  constructor(private readonly provider: TextToSpeechProvider) {}

  async generate(
    script: VideoScript,
    publicDirectory: string,
    language: string,
    voice: string,
    progress?: JobProgressReporter
  ) {
    const audioDirectory = path.join(publicDirectory, "audio");
    await mkdir(audioDirectory, { recursive: true });
    const blocks = [
      { id: "intro", text: script.introduction.narration },
      ...script.scenes.map((scene) => ({ id: scene.id, newsItemId: scene.newsItemId, text: scene.narration })),
      { id: "conclusion", text: script.conclusion.narration }
    ];
    const tracks: NarrationTrack[] = [];

    for (const [index, block] of blocks.entries()) {
      progress?.throwIfCancelled?.();
      await progress?.({
        percent: 30 + Math.round((index / blocks.length) * 18),
        message: `Generando narracion ${index + 1}/${blocks.length}...`,
        processedCount: index,
        totalCount: blocks.length
      });
      const fileName = `${String(index + 1).padStart(2, "0")}-${safeId(block.id)}.wav`;
      const absolutePath = path.join(audioDirectory, fileName);
      const result = await this.provider.synthesize({
        text: block.text,
        language,
        voice,
        outputPath: absolutePath,
        signal: progress?.signal
      });
      tracks.push({
        id: block.id,
        newsItemId: "newsItemId" in block ? block.newsItemId : undefined,
        relativeFile: `audio/${fileName}`,
        absolutePath,
        durationSeconds: result.durationSeconds,
        text: block.text
      });
    }
    return tracks;
  }
}
