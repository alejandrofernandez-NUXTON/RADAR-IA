import { rm, stat } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { getVideoMetadata, makeCancelSignal, renderMedia, RenderInternals, selectComposition } from "@remotion/renderer";
import type { JobProgressReporter } from "@/lib/types";
import { VideoDigestError } from "@/video/errors";
import { videoRenderPropsSchema, type VideoRenderProps } from "@/video/types/video-types";

export type RenderWorkspace = {
  publicDirectory: string;
  bundleDirectory: string;
  videoPath: string;
  thumbnailPath: string;
};

const TELEGRAM_VIDEO_LIMIT_BYTES = 50 * 1024 * 1024;

export class VideoRenderService {
  async render(propsInput: VideoRenderProps, workspace: RenderWorkspace, progress?: JobProgressReporter) {
    const props = videoRenderPropsSchema.parse(propsInput);
    progress?.throwIfCancelled?.();
    await rm(workspace.bundleDirectory, { recursive: true, force: true });
    await progress?.({ percent: 70, message: "Preparando la composicion de video..." });

    const serveUrl = await bundle({
      entryPoint: path.resolve(process.cwd(), "video/remotion/index.ts"),
      outDir: workspace.bundleDirectory,
      publicDir: workspace.publicDirectory,
      rootDir: process.cwd(),
      enableCaching: true,
      onProgress: (value) => {
        const ratio = value > 1 ? value / 100 : value;
        void progress?.({ percent: 70 + Math.round(Math.max(0, Math.min(1, ratio)) * 5), message: "Empaquetando composicion Remotion..." });
      }
    });
    progress?.throwIfCancelled?.();

    const { cancelSignal, cancel } = makeCancelSignal();
    const abort = () => cancel();
    progress?.signal?.addEventListener("abort", abort, { once: true });

    try {
      const composition = await selectComposition({
        serveUrl,
        id: "ExplainerVideo",
        inputProps: props,
        logLevel: "warn",
        timeoutInMilliseconds: 120_000
      });
      progress?.throwIfCancelled?.();
      await progress?.({ percent: 75, message: "Renderizando frames y audio..." });

      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        audioCodec: "aac",
        pixelFormat: "yuv420p",
        crf: 22,
        outputLocation: workspace.videoPath,
        inputProps: props,
        overwrite: true,
        concurrency: 2,
        cancelSignal,
        logLevel: "warn",
        onProgress: ({ progress: renderProgress, stitchStage }) => {
          const percent = 75 + Math.round(renderProgress * 20);
          const message = stitchStage === "muxing" ? "Uniendo video y narracion..." : "Renderizando escenas...";
          void progress?.({ percent, message });
        }
      });
      progress?.throwIfCancelled?.();

      await RenderInternals.callFf({
        bin: "ffmpeg",
        args: [
          "-y",
          "-ss",
          "3",
          "-i",
          workspace.videoPath,
          "-frames:v",
          "1",
          "-update",
          "1",
          "-q:v",
          "2",
          workspace.thumbnailPath
        ],
        indent: false,
        logLevel: "warn",
        binariesDirectory: null,
        cancelSignal
      });
    } catch (error) {
      if (progress?.signal?.aborted) throw new Error("Proceso detenido manualmente.", { cause: error });
      throw new VideoDigestError(
        "VIDEO_RENDER_ERROR",
        `No se pudo renderizar el MP4: ${error instanceof Error ? error.message : "error desconocido"}`,
        { cause: error }
      );
    } finally {
      progress?.signal?.removeEventListener("abort", abort);
    }

    await progress?.({ percent: 97, message: "Validando el archivo MP4..." });
    const [metadata, file] = await Promise.all([getVideoMetadata(workspace.videoPath), stat(workspace.videoPath)]);
    if (
      metadata.codec !== "h264" ||
      metadata.audioCodec !== "aac" ||
      metadata.width !== props.width ||
      metadata.height !== props.height ||
      !metadata.canPlayInVideoTag ||
      !metadata.durationInSeconds ||
      file.size < 10_000
    ) {
      throw new VideoDigestError("VIDEO_VALIDATION_ERROR", "El MP4 generado no cumple resolucion, codecs o duracion esperados.");
    }
    if (file.size > TELEGRAM_VIDEO_LIMIT_BYTES) {
      throw new VideoDigestError(
        "VIDEO_VALIDATION_ERROR",
        `El MP4 ocupa ${(file.size / 1024 / 1024).toFixed(1)} MB y supera el limite actual de 50 MB de Telegram Bot API.`
      );
    }

    return {
      durationSeconds: Math.round(metadata.durationInSeconds),
      width: metadata.width,
      height: metadata.height,
      fps: Math.round(metadata.fps),
      sizeBytes: file.size,
      codec: metadata.codec,
      audioCodec: metadata.audioCodec,
      canPlayInVideoTag: metadata.canPlayInVideoTag
    };
  }
}
