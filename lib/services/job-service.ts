import { JobStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NewsAnalysisService } from "@/lib/services/news-analysis-service";
import { TrainingSearchService } from "@/lib/services/training-search-service";
import type { JobResult } from "@/lib/types";

type JobHandler = () => Promise<JobResult>;

export class JobService {
  private newsAnalysisService = new NewsAnalysisService();
  private trainingSearchService = new TrainingSearchService();

  async runNewsJob() {
    return this.runTrackedJob("news_analysis", () => this.newsAnalysisService.processActiveSources());
  }

  async runTrainingJob() {
    return this.runTrackedJob("training_search", () => this.trainingSearchService.runSearch());
  }

  async runTelegramPendingJob() {
    return this.runTrackedJob("telegram_send_pending", () => this.newsAnalysisService.sendPendingToTelegram());
  }

  private async runTrackedJob(jobType: string, handler: JobHandler) {
    const jobRun = await prisma.jobRun.create({
      data: {
        jobType,
        status: JobStatus.RUNNING
      }
    });

    try {
      const result = await handler();
      const status = result.failedCount > 0 ? JobStatus.PARTIAL : JobStatus.SUCCESS;
      return prisma.jobRun.update({
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
    } catch (error) {
      return prisma.jobRun.update({
        where: { id: jobRun.id },
        data: {
          status: JobStatus.FAILED,
          finishedAt: new Date(),
          failedCount: 1,
          errorMessage: (error as Error).message
        }
      });
    }
  }
}
