"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clampPercent, runStreamedJob, type ProgressPayload } from "@/lib/client/streamed-job";
import { cn } from "@/lib/utils";

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

type ScheduleStatusBoxProps = {
  jobType: string;
  endpoint: string;
  jobLabel: string;
  automationEnabled: boolean;
  hasSchedule: boolean;
  scheduleText: string;
  nextRunAt: string | null;
  savedAt: string | null;
};

type ScheduledRunState = {
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

function formatCountdown(ms: number) {
  if (ms <= 0) return "Pendiente de ejecucion";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function ScheduleStatusBox({
  jobType,
  endpoint,
  jobLabel,
  automationEnabled,
  hasSchedule,
  scheduleText,
  nextRunAt,
  savedAt
}: ScheduleStatusBoxProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [jobs, setJobs] = useState<RuntimeJobStatus[]>([]);
  const [scheduledRun, setScheduledRun] = useState<ScheduledRunState | null>(null);
  const triggeredRunKey = useRef<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const response = await fetch("/api/jobs/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { jobs?: RuntimeJobStatus[] };
        if (!cancelled) setJobs(payload.jobs || []);
      } catch {
        if (!cancelled) setJobs([]);
      }
    }

    void loadJobs();
    const interval = window.setInterval(() => void loadJobs(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const runningJob = useMemo(() => jobs.find((job) => job.jobType === jobType && job.status === "running"), [jobType, jobs]);
  const displayJob = scheduledRun?.status === "running" ? scheduledRun : runningJob || scheduledRun;
  const countdown = automationEnabled && nextRunAt ? formatCountdown(new Date(nextRunAt).getTime() - now) : null;

  const runScheduledJob = useCallback(async (triggerKey: string) => {
    const startedAt = new Date().toISOString();
    setScheduledRun({
      jobRunId: `scheduled-${triggerKey}`,
      jobType,
      status: "running",
      percent: 1,
      message: `Programacion alcanzada. Ejecutando ${jobLabel.toLowerCase()}...`,
      startedAt,
      updatedAt: startedAt
    });

    try {
      const jobResult = await runStreamedJob(endpoint, (progress: ProgressPayload) => {
        setScheduledRun((current) => ({
          jobRunId: current?.jobRunId || `scheduled-${triggerKey}`,
          jobType,
          status: "running",
          percent: clampPercent(progress.percent),
          message: progress.message,
          startedAt: current?.startedAt || startedAt,
          updatedAt: new Date().toISOString(),
          processedCount: progress.processedCount,
          totalCount: progress.totalCount,
          successCount: progress.successCount,
          failedCount: progress.failedCount
        }));
      });

      const finishedAt = new Date().toISOString();
      const failed = jobResult.status === "FAILED";
      const message =
        failed && jobResult.errorMessage
          ? jobResult.errorMessage
          : failed
            ? "Job programado terminado con error."
            : "Job programado terminado.";
      setScheduledRun((current) => ({
        jobRunId: current?.jobRunId || `scheduled-${triggerKey}`,
        jobType,
        status: failed ? "failed" : "success",
        percent: 100,
        message,
        startedAt: current?.startedAt || startedAt,
        updatedAt: finishedAt,
        finishedAt,
        processedCount: jobResult.processedCount,
        successCount: jobResult.successCount,
        failedCount: jobResult.failedCount
      }));
      router.refresh();
    } catch (error) {
      const finishedAt = new Date().toISOString();
      setScheduledRun((current) => ({
        jobRunId: current?.jobRunId || `scheduled-${triggerKey}`,
        jobType,
        status: "failed",
        percent: 100,
        message: error instanceof Error ? error.message : "No se pudo ejecutar el job programado.",
        startedAt: current?.startedAt || startedAt,
        updatedAt: finishedAt,
        finishedAt,
        failedCount: 1
      }));
      router.refresh();
    }
  }, [endpoint, jobLabel, jobType, router]);

  useEffect(() => {
    if (!automationEnabled || !hasSchedule || !nextRunAt) return;
    const targetTime = new Date(nextRunAt).getTime();
    if (!Number.isFinite(targetTime) || now < targetTime) return;
    if (triggeredRunKey.current === nextRunAt) return;
    if (runningJob || scheduledRun?.status === "running") return;

    triggeredRunKey.current = nextRunAt;
    void runScheduledJob(nextRunAt);
  }, [automationEnabled, hasSchedule, nextRunAt, now, runningJob, runScheduledJob, scheduledRun?.status]);

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-6">
        {hasSchedule ? (
          <>
            <p className="font-medium text-foreground">{scheduleText}</p>
            <p className="text-xs text-muted-foreground">
              {!automationEnabled
                ? "Contadores automaticos pausados."
                : nextRunAt
                  ? `Proxima ejecucion: ${formatDateTime(nextRunAt)}`
                  : "Proxima ejecucion no calculada."}
              {savedAt ? ` Guardada: ${formatDateTime(savedAt)}.` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No se ha establecido programacion.</p>
        )}
      </div>

      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">Cuenta atras</p>
        <p className="mt-1 text-sm font-semibold tabular-nums">
          {!automationEnabled ? "Pausado" : hasSchedule && countdown ? countdown : "Sin programacion"}
        </p>
      </div>

      {displayJob ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{displayJob.message}</span>
            <span>{displayJob.percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayJob.percent}>
            <div
              className={cn("h-full rounded-full transition-all duration-500", displayJob.status === "failed" ? "bg-destructive" : "bg-primary")}
              style={{ width: `${displayJob.percent}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {typeof displayJob.processedCount === "number" ? (
              <span>
                {displayJob.processedCount}
                {displayJob.totalCount ? `/${displayJob.totalCount}` : ""} procesados
              </span>
            ) : null}
            {typeof displayJob.successCount === "number" ? <span>{displayJob.successCount} OK</span> : null}
            {typeof displayJob.failedCount === "number" ? <span>{displayJob.failedCount} errores</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
