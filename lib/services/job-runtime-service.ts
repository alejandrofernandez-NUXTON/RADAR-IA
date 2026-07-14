import type { JobProgress } from "@/lib/types";

type RuntimeJobStatus = {
  jobRunId: string;
  jobType: string;
  status: "running" | "success" | "failed";
  percent: number;
  message: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  processedCount?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
};

type RuntimeState = {
  jobs: Map<string, RuntimeJobStatus>;
};

const globalRuntimeState = globalThis as typeof globalThis & {
  __radarJobRuntimeState?: RuntimeState;
};

function state() {
  globalRuntimeState.__radarJobRuntimeState ??= {
    jobs: new Map<string, RuntimeJobStatus>()
  };
  return globalRuntimeState.__radarJobRuntimeState;
}

function nowIso() {
  return new Date().toISOString();
}

export class JobRuntimeService {
  static start(jobRunId: string, jobType: string) {
    state().jobs.set(jobType, {
      jobRunId,
      jobType,
      status: "running",
      percent: 1,
      message: "Job iniciado...",
      startedAt: nowIso(),
      updatedAt: nowIso()
    });
  }

  static progress(jobType: string, progress: JobProgress) {
    const current = state().jobs.get(jobType);
    if (!current) return;

    state().jobs.set(jobType, {
      ...current,
      status: "running",
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      message: progress.message,
      updatedAt: nowIso(),
      processedCount: progress.processedCount,
      totalCount: progress.totalCount,
      successCount: progress.successCount,
      failedCount: progress.failedCount
    });
  }

  static finish(jobType: string, status: "success" | "failed", progress: JobProgress) {
    const current = state().jobs.get(jobType);
    if (!current) return;

    state().jobs.set(jobType, {
      ...current,
      status,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
      message: progress.message,
      updatedAt: nowIso(),
      finishedAt: nowIso(),
      processedCount: progress.processedCount,
      totalCount: progress.totalCount,
      successCount: progress.successCount,
      failedCount: progress.failedCount
    });
  }

  static list() {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [jobType, job] of state().jobs.entries()) {
      if (job.status !== "running" && new Date(job.updatedAt).getTime() < tenMinutesAgo) {
        state().jobs.delete(jobType);
      }
    }

    return Array.from(state().jobs.values());
  }
}
