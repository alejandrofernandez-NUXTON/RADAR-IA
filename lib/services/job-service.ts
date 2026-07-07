import { JobStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NewsAnalysisService } from "@/lib/services/news-analysis-service";
import { TrainingSearchService } from "@/lib/services/training-search-service";
import type { JobProgressReporter, JobResult } from "@/lib/types";

type JobHandler = (progress?: JobProgressReporter) => Promise<JobResult>;

export class JobService {
  private newsAnalysisService = new NewsAnalysisService();
  private trainingSearchService = new TrainingSearchService();

  async runNewsJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("news_analysis", (report) => this.newsAnalysisService.processActiveSources(report), progress);
  }

  async runTrainingJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("training_search", (report) => this.trainingSearchService.runSearch(undefined, report), progress);
  }

  async runTelegramPendingJob(progress?: JobProgressReporter) {
    return this.runTrackedJob("telegram_send_pending", (report) => this.newsAnalysisService.sendPendingToTelegram(report), progress);
  }

  private async runTrackedJob(jobType: string, handler: JobHandler, progress?: JobProgressReporter) {
    const jobRun = await prisma.jobRun.create({
      data: {
        jobType,
        status: JobStatus.RUNNING
      }
    });

    try {
      await progress?.({ percent: 1, message: "Job iniciado..." });
      const result = await handler(progress);
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
      await progress?.({
        percent: 100,
        message: status === JobStatus.SUCCESS ? "Job terminado correctamente." : "Job terminado con incidencias.",
        processedCount: result.processedCount,
        successCount: result.successCount,
        failedCount: result.failedCount
      });
      return updated;
    } catch (error) {
      const updated = await prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          failedCount: 1,
          errorMessage: (error as Error).message
        }
      });
      await progress?.({
        percent: 100,
        message: `Job fallido: ${(error as Error).message}`,
        failedCount: 1
      });
      return updated;
    }
  }
}
