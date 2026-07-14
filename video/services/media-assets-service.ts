import path from "path";
import { LogService } from "@/lib/services/log-service";
import type { JobProgressReporter } from "@/lib/types";
import type { NewsSnapshot } from "@/video/schemas/news-snapshot-schema";
import type { VideoScript } from "@/video/schemas/video-script-schema";
import { safeDownloadImage } from "@/video/utils/safe-media-download";

export class MediaAssetsService {
  async prepare(
    videoDigestId: string,
    script: VideoScript,
    snapshots: NewsSnapshot[],
    publicDirectory: string,
    progress?: JobProgressReporter
  ) {
    const mediaDirectory = path.join(publicDirectory, "media");
    const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.newsItemId, snapshot]));
    const assets = new Map<string, string>();

    for (const [index, scene] of script.scenes.entries()) {
      progress?.throwIfCancelled?.();
      await progress?.({
        percent: 50 + Math.round((index / Math.max(1, script.scenes.length)) * 8),
        message: `Preparando imagen ${index + 1}/${script.scenes.length}...`,
        processedCount: index,
        totalCount: script.scenes.length
      });
      const snapshot = snapshotById.get(scene.newsItemId);
      const candidate = snapshot?.source.thumbnailUrl || scene.preferredImageUrl;
      if (!candidate) continue;

      try {
        const downloaded = await safeDownloadImage(candidate, mediaDirectory, `scene-${index + 1}`, progress?.signal);
        assets.set(scene.newsItemId, `media/${downloaded.fileName}`);
      } catch (error) {
        await LogService.warn("video.assets", "No se pudo usar una imagen; se aplicara el fondo de marca.", {
          videoDigestId,
          newsItemId: scene.newsItemId,
          hostname: safeHostname(candidate),
          error: error instanceof Error ? error.message : "Error desconocido"
        });
      }
    }
    return assets;
  }
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid";
  }
}
