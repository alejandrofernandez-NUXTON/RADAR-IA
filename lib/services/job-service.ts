import { JobStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { JobCancellationService, JobCancelledError } from "@/lib/services/job-cancellation-service";
import { JobRuntimeService } from "@/lib/services/job-runtime-service";
import { NewsAnalysisService } from "@/lib/services/news-analysis-service";
import { TrainingSearchService } from "@/lib/services/training-search-service";
import { VideoDigestService } from "@/lib/services/video-digest-service";
import { SettingsService } from "@/lib/services/settings-service";
import { shouldAutoGenerateVideo } from "@/lib/services/video-automation-policy";
import type { JobProgress, JobProgressReporter, JobResult } from "@/lib/types";

type JobHandler = (progress?: JobProgressReporter) => Promise<JobResult>;

export class JobService {
  private newsAnalysisService = new NewsAnalysisService();
  private trainingSearchService = new TrainingSearchService();
  private videoDigestService = new VideoDigestService();

  async runSourceCollectionJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("source_collection", (report) => this.newsAnalysisService.collectLatestFromActiveSources(report), progress);
  }

  async runNewsProcessingJob(progress?: JobProgressReporter) {
    return this.runTrackedJob(
      "news_processing",
      async (report) => {
        const settings = await SettingsService.getAll();
        const autoGenerate = shouldAutoGenerateVideo({
          deliveryMode: settings.telegramDeliveryMode,
          videoEnabled: settings.video.enabled,
          autoGenerateAfterProcessing: settings.video.autoGenerateAfterProcessing,
          autoSendOnSchedule: settings.video.autoSendOnSchedule
        });

        if (!autoGenerate) {
          return this.newsAnalysisService.processPendingCollectedItems(report);
        }

        const analysisProgress: JobProgressReporter = (step) =>
          report?.({
            ...step,
            percent: Math.min(48, Math.max(2, Math.round(2 + step.percent * 0.46))),
            message: `OpenAI: ${step.message}`
          });
        analysisProgress.signal = report?.signal;
        analysisProgress.throwIfCancelled = report?.throwIfCancelled;
        const processing = await this.newsAnalysisService.processPendingCollectedItems(analysisProgress);

        await report?.({ percent: 50, message: "Analisis terminado. Preparando generacion automatica del video..." });
        const videoProgress: JobProgressReporter = (step) =>
          report?.({
            ...step,
            percent: Math.min(99, Math.max(52, Math.round(52 + step.percent * 0.47))),
            message: `Video: ${step.message}`
          });
        videoProgress.signal = report?.signal;
        videoProgress.throwIfCancelled = report?.throwIfCancelled;
        const video = await this.videoDigestService.generateFromPendingNews(videoProgress);

        return {
          processedCount: processing.processedCount,
          successCount: processing.successCount,
          failedCount: processing.failedCount + video.failedCount,
          metadata: {
            processing: processing.metadata,
            video: video.metadata,
            videoAutoGeneration: true
          }
        };
      },
      progress
    );
  }

  async runNewsJob(progress?: JobProgressReporter) {
    return this.runTrackedJob(
      "news_analysis",
      async (report) => {
        await report?.({ percent: 2, message: "Iniciando recogida y procesado de noticias..." });
        const collectionReport: JobProgressReporter = (step) =>
          report?.({
            ...step,
            percent: Math.min(48, Math.max(2, Math.round(step.percent * 0.48))),
            message: `Recogida: ${step.message}`
          });
        collectionReport.signal = report?.signal;
        collectionReport.throwIfCancelled = report?.throwIfCancelled;
        const collection = await this.newsAnalysisService.collectLatestFromActiveSources(collectionReport);

        const processingReport: JobProgressReporter = (step) =>
          report?.({
            ...step,
            percent: Math.min(96, 50 + Math.round(step.percent * 0.46)),
            message: `Procesado: ${step.message}`
          });
        processingReport.signal = report?.signal;
        processingReport.throwIfCancelled = report?.throwIfCancelled;
        const processing = await this.newsAnalysisService.processPendingCollectedItems(processingReport);

        return {
          processedCount: collection.processedCount + processing.processedCount,
          successCount: collection.successCount + processing.successCount,
          failedCount: collection.failedCount + processing.failedCount,
          metadata: {
            collection: collection.metadata,
            processing: processing.metadata
          }
        };
      },
      progress
    );
  }

  async runTrainingJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("training_search", (report) => this.trainingSearchService.runSearch(undefined, report), progress);
  }

  async runTelegramPendingJob(
    progress?: JobProgressReporter,
    options: { ignoreAutoDisabled?: boolean; scheduled?: boolean } = {}
  ) {
    return this.runTrackedJob("telegram_send_pending", (report) => this.newsAnalysisService.sendPendingToTelegram(report, options), progress);
  }

  async runVideoGenerationJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("video_generate_pending", (report) => this.videoDigestService.generateFromPendingNews(report), progress);
  }

  async runVideoRegenerationJob(videoDigestId: string, progress?: JobProgressReporter) {
    return this.runTrackedJob("video_regenerate", (report) => this.videoDigestService.regenerateDigest(videoDigestId, report), progress);
  }

  private async runTrackedJob(jobType: string, handler: JobHandler, progress?: JobProgressReporter) {
    const jobRun = await prisma.jobRun.create({
      data: {
        jobType,
        status: JobStatus.RUNNING
      }
    });
    const cancellation = JobCancellationService.register(jobRun.id, jobType);
    JobRuntimeService.start(jobRun.id, jobType);

    const report: JobProgressReporter = async (step: JobProgress) => {
      cancellation.throwIfCancelled();
      JobRuntimeService.progress(jobType, step);
      await progress?.(step);
      cancellation.throwIfCancelled();
    };
    report.signal = cancellation.signal;
    report.throwIfCancelled = cancellation.throwIfCancelled;

    try {
      await report({ percent: 1, message: "Job iniciado..." });
      const result = await handler(report);
      cancellation.throwIfCancelled();
      const status = result.failedCount > 0 ? JobStatus.PARTIAL : JobStatus.SUCCESS;
      const updated = await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status,
          finishedAt: new Date(),
          processedCount: result.processedCount,
          successCount: result.successCount,
          failedCount: result.failedCount,
          metadata: result.metadata as Prisma.InputJsonValue
        }
      });
      await report({
        percent: 100,
        message: status === JobStatus.SUCCESS ? "Job terminado correctamente." : "Job terminado con incidencias.",
        processedCount: result.processedCount,
        successCount: result.successCount,
        failedCount: result.failedCount
      });
      JobRuntimeService.finish(jobType, status === JobStatus.SUCCESS ? "success" : "failed", {
        percent: 100,
        message: status === JobStatus.SUCCESS ? "Job terminado correctamente." : "Job terminado con incidencias.",
        processedCount: result.processedCount,
        successCount: result.successCount,
        failedCount: result.failedCount
      });
      return updated;
    } catch (error) {
      const cancelled = error instanceof JobCancelledError;
      const message = cancelled ? error.message : (error as Error).message;
      const updated = await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          failedCount: 1,
          errorMessage: message,
          metadata: cancelled ? ({ cancelled: true } as Prisma.InputJsonValue) : undefined
        }
      });
      await progress?.({
        percent: 100,
        message: cancelled ? `Job cancelado: ${message}` : `Job fallido: ${message}`,
        failedCount: 1
      });
      JobRuntimeService.finish(jobType, "failed", {
        percent: 100,
        message: cancelled ? `Job cancelado: ${message}` : `Job fallido: ${message}`,
        failedCount: 1
      });
      return updated;
    } finally {
      cancellation.finish();
    }
  }
}
