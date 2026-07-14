type ActiveJob = {
  id: string;
  jobType: string;
  controller: AbortController;
  startedAt: Date;
};

type CancellationState = {
  activeJobs: Map<string, ActiveJob>;
};

const globalCancellationState = globalThis as typeof globalThis & {
  __radarJobCancellationState?: CancellationState;
};

function state() {
  globalCancellationState.__radarJobCancellationState ??= {
    activeJobs: new Map<string, ActiveJob>()
  };
  return globalCancellationState.__radarJobCancellationState;
}

export class JobCancelledError extends Error {
  constructor(
    readonly jobId: string,
    readonly jobType: string,
    reason = "Proceso detenido manualmente."
  ) {
    super(reason);
    this.name = "JobCancelledError";
  }
}

export type JobCancellationToken = {
  jobId: string;
  jobType: string;
  signal: AbortSignal;
  throwIfCancelled: () => void;
  finish: () => void;
};

export class JobCancellationService {
  static register(jobId: string, jobType: string): JobCancellationToken {
    const controller = new AbortController();
    const activeJob: ActiveJob = {
      id: jobId,
      jobType,
      controller,
      startedAt: new Date()
    };
    state().activeJobs.set(jobId, activeJob);

    return {
      jobId,
      jobType,
      signal: controller.signal,
      throwIfCancelled: () => {
        if (controller.signal.aborted) {
          const reason = typeof controller.signal.reason === "string" ? controller.signal.reason : "Proceso detenido manualmente.";
          throw new JobCancelledError(jobId, jobType, reason);
        }
      },
      finish: () => {
        state().activeJobs.delete(jobId);
      }
    };
  }

  static cancelAll(reason = "Proceso detenido manualmente desde el panel de Jobs.") {
    const activeJobs = Array.from(state().activeJobs.values());
    for (const job of activeJobs) {
      if (!job.controller.signal.aborted) {
        job.controller.abort(reason);
      }
    }

    return {
      cancelledCount: activeJobs.length,
      jobs: activeJobs.map((job) => ({
        id: job.id,
        jobType: job.jobType,
        startedAt: job.startedAt.toISOString()
      }))
    };
  }

  static cancelByType(jobType: string, reason = "Proceso detenido manualmente.") {
    const activeJobs = Array.from(state().activeJobs.values()).filter((job) => job.jobType === jobType);
    for (const job of activeJobs) {
      if (!job.controller.signal.aborted) job.controller.abort(reason);
    }
    return activeJobs.length;
  }

  static listActive() {
    return Array.from(state().activeJobs.values()).map((job) => ({
      id: job.id,
      jobType: job.jobType,
      startedAt: job.startedAt.toISOString(),
      cancelled: job.controller.signal.aborted
    }));
  }
}
