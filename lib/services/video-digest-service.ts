import { mkdir, writeFile } from "fs/promises";
import { NewsStatus, Prisma, VideoDigestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { JobCancellationService } from "@/lib/services/job-cancellation-service";
import { LogService } from "@/lib/services/log-service";
import { SettingsService } from "@/lib/services/settings-service";
import { TelegramPendingNewsService } from "@/lib/services/telegram-pending-news-service";
import { TelegramService } from "@/lib/services/telegram-service";
import type { JobProgressReporter, JobResult } from "@/lib/types";
import { VideoDigestError, videoErrorDetails } from "@/video/errors";
import { createNewsSnapshot, digestInputHash, newsSnapshotSchema, sourceRevisionHash } from "@/video/schemas/news-snapshot-schema";
import { MediaAssetsService } from "@/video/services/media-assets-service";
import { NarrationService } from "@/video/services/narration-service";
import { timelineToSrt } from "@/video/services/subtitle-service";
import { createTtsProvider } from "@/video/services/tts-provider";
import { VideoRenderService } from "@/video/services/video-render-service";
import { VideoScriptService } from "@/video/services/video-script-service";
import { LocalVideoStorageProvider } from "@/video/services/video-storage-service";
import { assertVideoDigestTransition } from "@/video/state-machine";
import { videoTimelineSchema, type VideoRenderProps } from "@/video/types/video-types";
import { buildTimeline } from "@/video/utils/timing";

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class VideoDigestService {
  private readonly pendingService = new TelegramPendingNewsService();
  private readonly scriptService = new VideoScriptService();
  private readonly assetsService = new MediaAssetsService();
  private readonly renderService = new VideoRenderService();

  async generateFromPendingNews(progress?: JobProgressReporter): Promise<JobResult> {
    const settings = await SettingsService.getAll();
    await progress?.({ percent: 2, message: "Comprobando configuracion de video..." });
    if (!settings.video.enabled) {
      await progress?.({ percent: 100, message: "La generacion de videos esta desactivada en Ajustes." });
      return { processedCount: 0, successCount: 0, failedCount: 0, metadata: { skipped: true, reason: "video_disabled" } };
    }

    await progress?.({ percent: 5, message: "Buscando noticias pendientes de Telegram..." });
    await LogService.info("video.selection.started", "Buscando noticias para un nuevo video.");
    const claim = await this.pendingService.claimEligibleNewsForDigest();
    if (claim.kind === "empty") {
      await progress?.({ percent: 100, message: "No hay noticias publicadas y elegibles para un nuevo video." });
      return { processedCount: 0, successCount: 0, failedCount: 0, metadata: { skipped: true, reason: "no_pending_news" } };
    }
    if (claim.kind === "existing") {
      await progress?.({ percent: 100, message: `Ya existe un video abierto (${claim.digest.status}).` });
      return {
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        metadata: { skipped: true, reason: "open_digest_exists", digestId: claim.digest.id, digestStatus: claim.digest.status }
      };
    }

    await progress?.({
      percent: 10,
      message: `${claim.snapshots.length} noticia(s) reservadas para el video ${claim.digest.id}.`,
      processedCount: claim.snapshots.length,
      totalCount: claim.snapshots.length
    });
    await LogService.info("video.reservation.created", "Noticias reservadas para video.", {
      videoDigestId: claim.digest.id,
      newsCount: claim.snapshots.length,
      remainingCount: claim.remainingCount
    });
    try {
      await this.beginGeneration(claim.digest.id, VideoDigestStatus.QUEUED);
    } catch (error) {
      await prisma.$transaction([
        prisma.videoDigest.updateMany({
          where: { id: claim.digest.id, status: VideoDigestStatus.QUEUED },
          data: { status: VideoDigestStatus.CANCELLED, cancelledAt: new Date() }
        }),
        prisma.newsItem.updateMany({
          where: { videoDigestReservationId: claim.digest.id },
          data: { videoDigestReservationId: null }
        })
      ]);
      throw error;
    }
    return this.generateDigest(claim.digest.id, claim.remainingCount, progress);
  }

  async regenerateDigest(videoDigestId: string, progress?: JobProgressReporter): Promise<JobResult> {
    await this.refreshSnapshotsAndBegin(videoDigestId);
    return this.generateDigest(videoDigestId, await this.pendingService.countEligibleNews(), progress);
  }

  async sendDigestToTelegram(videoDigestId: string) {
    return new TelegramService().sendVideoDigest(videoDigestId);
  }

  async cancelDigest(videoDigestId: string) {
    const digest = await prisma.videoDigest.findUnique({ where: { id: videoDigestId } });
    if (!digest) throw new VideoDigestError("VIDEO_DIGEST_NOT_FOUND", "El video solicitado no existe.");
    if (digest.status === VideoDigestStatus.CANCELLED) return { skipped: true, digest };
    assertVideoDigestTransition(digest.status, VideoDigestStatus.CANCELLED);

    if (digest.status === VideoDigestStatus.GENERATING) {
      JobCancellationService.cancelByType("video_generate_pending", `Video ${videoDigestId} cancelado desde administracion.`);
    }
    const cancelledAt = new Date();
    const [, released] = await prisma.$transaction([
      prisma.videoDigest.update({
        where: { id: videoDigestId },
        data: {
          status: VideoDigestStatus.CANCELLED,
          cancelledAt,
          errorCode: null,
          errorMessage: null,
          videoStorageKey: null,
          thumbnailStorageKey: null,
          subtitleStorageKey: null
        }
      }),
      prisma.newsItem.updateMany({
        where: { videoDigestReservationId: videoDigestId },
        data: { videoDigestReservationId: null }
      })
    ]);
    const storage = await LocalVideoStorageProvider.create();
    await storage.deleteDigestFiles(videoDigestId);
    await LogService.info("video.cancelled", "Video cancelado y noticias liberadas.", {
      videoDigestId,
      releasedCount: released.count
    });
    return { skipped: false, releasedCount: released.count };
  }

  async getDigest(videoDigestId: string) {
    return prisma.videoDigest.findUnique({
      where: { id: videoDigestId },
      include: {
        items: { include: { newsItem: { include: { source: true } } }, orderBy: { position: "asc" } },
        telegramMessages: { orderBy: { createdAt: "desc" } }
      }
    });
  }

  async listDigests() {
    return prisma.videoDigest.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" }
    });
  }

  private async beginGeneration(videoDigestId: string, from: VideoDigestStatus) {
    assertVideoDigestTransition(from, VideoDigestStatus.GENERATING);
    const updated = await prisma.videoDigest.updateMany({
      where: { id: videoDigestId, status: from },
      data: {
        status: VideoDigestStatus.GENERATING,
        generationAttempts: { increment: 1 },
        errorCode: null,
        errorMessage: null,
        deliveryUncertain: false
      }
    });
    if (updated.count !== 1) {
      throw new VideoDigestError("VIDEO_DIGEST_INVALID_STATE", "El video ha cambiado de estado antes de comenzar.");
    }
  }

  private async refreshSnapshotsAndBegin(videoDigestId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nuxton_video_digest_${videoDigestId}`}))`;
      const digest = await tx.videoDigest.findUnique({
        where: { id: videoDigestId },
        include: { items: { orderBy: { position: "asc" } } }
      });
      if (!digest) throw new VideoDigestError("VIDEO_DIGEST_NOT_FOUND", "El video solicitado no existe.");
      assertVideoDigestTransition(digest.status, VideoDigestStatus.GENERATING);

      const newsItems = await tx.newsItem.findMany({
        where: { videoDigestReservationId: videoDigestId },
        include: { source: true }
      });
      if (newsItems.length !== digest.items.length) {
        throw new VideoDigestError("VIDEO_DIGEST_INTEGRITY_ERROR", "Las reservas del video no coinciden con su historial.");
      }
      const byId = new Map(newsItems.map((news) => [news.id, news]));
      const snapshots = digest.items.map((item) => {
        const news = item.newsItemId ? byId.get(item.newsItemId) : null;
        if (!news || news.status !== NewsStatus.PUBLISHED || news.sentToTelegramAt) {
          throw new VideoDigestError("NEWS_NO_LONGER_ELIGIBLE", "Una noticia ya no puede incluirse en el video.");
        }
        return createNewsSnapshot(news);
      });
      const hashes = snapshots.map(sourceRevisionHash);
      await Promise.all(
        digest.items.map((item, index) =>
          tx.videoDigestItem.update({
            where: { id: item.id },
            data: { contentSnapshot: snapshots[index] as Prisma.InputJsonValue, sourceRevisionHash: hashes[index] }
          })
        )
      );
      await tx.videoDigest.update({
        where: { id: videoDigestId },
        data: {
          status: VideoDigestStatus.GENERATING,
          inputHash: digestInputHash(hashes),
          generationAttempts: { increment: 1 },
          script: Prisma.JsonNull,
          timeline: Prisma.JsonNull,
          generatedAt: null,
          errorCode: null,
          errorMessage: null,
          deliveryUncertain: false
        }
      });
    });
  }

  private async generateDigest(videoDigestId: string, remainingCount: number, progress?: JobProgressReporter): Promise<JobResult> {
    const settings = await SettingsService.getAll();
    const storage = await LocalVideoStorageProvider.create();
    const workspace = await storage.workspace(videoDigestId);

    try {
      const digest = await prisma.videoDigest.findUnique({
        where: { id: videoDigestId },
        include: { items: { orderBy: { position: "asc" } } }
      });
      if (!digest || digest.status !== VideoDigestStatus.GENERATING) {
        throw new VideoDigestError("VIDEO_DIGEST_INVALID_STATE", "El video no esta en generacion.");
      }
      const snapshots = digest.items.map((item) => newsSnapshotSchema.parse(item.contentSnapshot));

      progress?.throwIfCancelled?.();
      await progress?.({ percent: 15, message: "Creando guion audiovisual con Gemini..." });
      await LogService.info("video.script.started", "Generando guion de video.", { videoDigestId, newsCount: snapshots.length });
      const scriptResult = await this.scriptService.generate(
        snapshots,
        digest.targetDurationSeconds,
        digest.language,
        progress?.signal
      );
      await prisma.videoDigest.update({
        where: { id: videoDigestId },
        data: { title: scriptResult.parsed.title, script: jsonValue(scriptResult.parsed) }
      });
      await LogService.info("video.script.completed", "Guion de video validado.", { videoDigestId });

      const ttsProvider = await createTtsProvider();
      const narration = new NarrationService(ttsProvider);
      await LogService.info("video.tts.started", "Generando pistas de narracion.", { videoDigestId });
      const tracks = await narration.generate(
        scriptResult.parsed,
        workspace.publicDirectory,
        digest.language,
        settings.video.ttsVoice,
        progress
      );
      await LogService.info("video.tts.completed", "Pistas de narracion generadas.", { videoDigestId, trackCount: tracks.length });

      await progress?.({ percent: 50, message: "Preparando imagenes y fondos de respaldo..." });
      const assets = await this.assetsService.prepare(videoDigestId, scriptResult.parsed, snapshots, workspace.publicDirectory, progress);
      let timeline = buildTimeline(scriptResult.parsed, tracks, settings.video.fps);
      timeline = videoTimelineSchema.parse({
        ...timeline,
        captions: settings.video.subtitlesEnabled ? timeline.captions : [],
        segments: timeline.segments.map((segment) => ({
          ...segment,
          imageFile: segment.newsItemId ? assets.get(segment.newsItemId) : undefined
        }))
      });

      await progress?.({ percent: 60, message: "Generando subtitulos y timeline..." });
      await mkdir(workspace.directory, { recursive: true });
      if (settings.video.subtitlesEnabled) await writeFile(workspace.subtitlePath, timelineToSrt(timeline), "utf8");
      await prisma.videoDigest.update({
        where: { id: videoDigestId },
        data: { timeline: jsonValue(timeline) }
      });

      const generatedDate = new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Madrid"
      }).format(new Date());
      const renderProps: VideoRenderProps = {
        script: scriptResult.parsed,
        timeline,
        width: settings.video.width,
        height: settings.video.height,
        fps: settings.video.fps,
        generatedDate
      };
      await LogService.info("video.render.started", "Comenzando render MP4.", { videoDigestId });
      const renderMetadata = await this.renderService.render(renderProps, workspace, progress);
      await storage.writeJson(workspace.manifestKey, {
        videoDigestId,
        inputHash: digest.inputHash,
        script: scriptResult.parsed,
        timeline,
        renderMetadata,
        generatedAt: new Date().toISOString()
      });

      const completed = await prisma.videoDigest.updateMany({
        where: { id: videoDigestId, status: VideoDigestStatus.GENERATING },
        data: {
          status: VideoDigestStatus.READY,
          title: scriptResult.parsed.title,
          script: jsonValue(scriptResult.parsed),
          timeline: jsonValue(timeline),
          renderMetadata: jsonValue(renderMetadata),
          videoStorageKey: workspace.videoKey,
          thumbnailStorageKey: workspace.thumbnailKey,
          subtitleStorageKey: settings.video.subtitlesEnabled ? workspace.subtitleKey : null,
          durationSeconds: renderMetadata.durationSeconds,
          width: renderMetadata.width,
          height: renderMetadata.height,
          fps: renderMetadata.fps,
          sizeBytes: BigInt(renderMetadata.sizeBytes),
          generatedAt: new Date(),
          errorCode: null,
          errorMessage: null
        }
      });
      if (completed.count !== 1) {
        throw new VideoDigestError("VIDEO_DIGEST_INVALID_STATE", "El video fue cancelado antes de completar el render.");
      }
      if (!settings.video.keepTempFiles) await storage.cleanupTemp(videoDigestId);
      await LogService.info("video.ready", "Video listo para revision; no se ha enviado a Telegram.", {
        videoDigestId,
        newsCount: snapshots.length,
        durationSeconds: renderMetadata.durationSeconds,
        sizeBytes: renderMetadata.sizeBytes
      });
      await progress?.({ percent: 100, message: "Video listo para revision. No se ha enviado a Telegram." });
      return {
        processedCount: snapshots.length,
        successCount: snapshots.length,
        failedCount: 0,
        metadata: {
          digestId: videoDigestId,
          digestStatus: VideoDigestStatus.READY,
          newsCount: snapshots.length,
          remainingCount,
          durationSeconds: renderMetadata.durationSeconds,
          sizeBytes: renderMetadata.sizeBytes,
          videoUrl: `/admin/videos/${videoDigestId}`
        }
      };
    } catch (error) {
      const cancelled = Boolean(progress?.signal?.aborted);
      const details = videoErrorDetails(error);
      if (cancelled) {
        await prisma.$transaction([
          prisma.videoDigest.updateMany({
            where: { id: videoDigestId, status: VideoDigestStatus.GENERATING },
            data: {
              status: VideoDigestStatus.CANCELLED,
              cancelledAt: new Date(),
              errorCode: null,
              errorMessage: "Generacion cancelada manualmente."
            }
          }),
          prisma.newsItem.updateMany({
            where: { videoDigestReservationId: videoDigestId },
            data: { videoDigestReservationId: null }
          })
        ]);
        await storage.deleteDigestFiles(videoDigestId);
        await LogService.info("video.cancelled", "Generacion cancelada y reservas liberadas.", { videoDigestId });
      } else {
        await prisma.videoDigest.updateMany({
          where: { id: videoDigestId, status: VideoDigestStatus.GENERATING },
          data: { status: VideoDigestStatus.GENERATION_FAILED, errorCode: details.code, errorMessage: details.message }
        });
        await storage.cleanupTemp(videoDigestId);
        await Promise.all([
          storage.delete(`${videoDigestId}/video.mp4`),
          storage.delete(`${videoDigestId}/thumbnail.jpg`),
          storage.delete(`${videoDigestId}/captions.srt`)
        ]);
        await LogService.error("video.render.failed", "Fallo la generacion del video.", {
          videoDigestId,
          errorCode: details.code,
          error: details.message
        });
      }
      throw error;
    }
  }
}
