"use client";

import { Brain, Film, PlayCircle, Search, Send, Square } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { runStreamedJob, clampPercent, type ProgressPayload } from "@/lib/client/streamed-job";
import { JOB_ENDPOINTS } from "@/lib/job-endpoints";
import { cn } from "@/lib/utils";

type JobButton = {
  id: string;
  label: string;
  endpoint: string;
  variant?: "primary" | "outline";
  icon: ReactNode;
};

type RunnerStep = {
  message: string;
  percent: number;
  time: number;
};

type RunnerState = {
  jobId: string;
  label: string;
  status: "running" | "success" | "failed";
  percent: number;
  message: string;
  startedAt: number;
  finishedAt?: number;
  processedCount?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
  steps: RunnerStep[];
};

const baseJobs: JobButton[] = [
  {
    id: "source-collection",
    label: "Recoger publicaciones ahora",
    endpoint: JOB_ENDPOINTS.sourceCollection,
    variant: "primary",
    icon: <Search className="h-4 w-4" aria-hidden />
  },
  {
    id: "news-processing",
    label: "Procesar pendientes con Gemini",
    endpoint: JOB_ENDPOINTS.newsProcessing,
    variant: "outline",
    icon: <Brain className="h-4 w-4" aria-hidden />
  },
  {
    id: "training",
    label: "Buscar formaciones ahora",
    endpoint: JOB_ENDPOINTS.trainingSearch,
    variant: "outline",
    icon: <PlayCircle className="h-4 w-4" aria-hidden />
  }
];

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function appendStep(current: RunnerState, message: string, percent: number) {
  if (current.steps.at(-1)?.message === message) return current.steps;
  return [...current.steps, { message, percent, time: Date.now() }].slice(-8);
}

export function JobRunner({ deliveryMode, videoEnabled }: { deliveryMode: "legacy_individual" | "video_digest_manual"; videoEnabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<RunnerState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const jobs = useMemo<JobButton[]>(() => {
    const deliveryJob: JobButton =
      deliveryMode === "legacy_individual"
        ? {
            id: "telegram",
            label: "Enviar pendientes a Telegram",
            endpoint: JOB_ENDPOINTS.telegramPending,
            variant: "outline",
            icon: <Send className="h-4 w-4" aria-hidden />
          }
        : {
            id: "video",
            label: "Generar video con noticias pendientes",
            endpoint: JOB_ENDPOINTS.videoGenerate,
            variant: "primary",
            icon: <Film className="h-4 w-4" aria-hidden />
          };
    const result = [...baseJobs, deliveryJob];
    if (deliveryMode === "legacy_individual" && videoEnabled) {
      result.push({
        id: "video",
        label: "Generar video con noticias pendientes",
        endpoint: JOB_ENDPOINTS.videoGenerate,
        variant: "outline",
        icon: <Film className="h-4 w-4" aria-hidden />
      });
    }
    return result;
  }, [deliveryMode, videoEnabled]);

  useEffect(() => {
    if (!state || state.status !== "running") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  const timing = useMemo(() => {
    if (!state) return null;
    const reference = state.finishedAt || now;
    const elapsed = reference - state.startedAt;
    const remaining =
      state.status === "running" && state.percent > 3 && state.percent < 98
        ? Math.round((elapsed * (100 - state.percent)) / state.percent)
        : null;

    return {
      elapsed: formatDuration(elapsed),
      remaining: remaining === null ? null : formatDuration(remaining)
    };
  }, [now, state]);

  async function runJob(job: JobButton) {
    const startedAt = Date.now();
    const initialMessage = "Conectando con el job...";
    setState({
      jobId: job.id,
      label: job.label,
      status: "running",
      percent: 1,
      message: initialMessage,
      startedAt,
      steps: [{ message: initialMessage, percent: 1, time: startedAt }]
    });

    try {
      const jobResult = await runStreamedJob(job.endpoint, (progress: ProgressPayload) => {
        const percent = clampPercent(progress.percent);
        setState((current) =>
          current
            ? {
                ...current,
                percent,
                message: progress.message,
                processedCount: progress.processedCount,
                totalCount: progress.totalCount,
                successCount: progress.successCount,
                failedCount: progress.failedCount,
                steps: appendStep(current, progress.message, percent)
              }
            : current
        );
      });

      const message =
        jobResult.status === "FAILED" && jobResult.errorMessage
          ? jobResult.errorMessage
          : jobResult.status === "FAILED"
            ? "Job terminado con error."
            : "Job terminado.";
      setState((current) =>
        current
          ? {
              ...current,
              status: jobResult.status === "FAILED" ? "failed" : "success",
              percent: 100,
              message,
              finishedAt: Date.now(),
              processedCount: jobResult.processedCount,
              successCount: jobResult.successCount,
              failedCount: jobResult.failedCount,
              steps: appendStep(current, message, 100)
            }
          : current
      );

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error ejecutando el job.";
      setState((current) =>
        current
          ? {
              ...current,
              status: "failed",
              percent: 100,
              message,
              finishedAt: Date.now(),
              steps: appendStep(current, message, 100)
            }
          : current
      );
    }
  }

  async function stopAllJobs() {
    setState((current) =>
      current
        ? {
            ...current,
            message: "Solicitando parada de procesos activos...",
            steps: appendStep(current, "Solicitando parada de procesos activos...", current.percent)
          }
        : current
    );

    try {
      const response = await fetch("/api/jobs/stop-all", { method: "POST" });
      if (!response.ok) throw new Error(`El servidor devolvio ${response.status}.`);
      const result = (await response.json()) as { cancelledCount?: number };
      const message = result.cancelledCount
        ? `Parada solicitada para ${result.cancelledCount} proceso(s).`
        : "No habia procesos activos para parar.";
      setState((current) =>
        current
          ? {
              ...current,
              message,
              steps: appendStep(current, message, current.percent)
            }
          : {
              jobId: "stop-all",
              label: "Parar todo proceso",
              status: "success",
              percent: 100,
              message,
              startedAt: Date.now(),
              finishedAt: Date.now(),
              steps: [{ message, percent: 100, time: Date.now() }]
            }
      );
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo solicitar la parada.";
      setState((current) =>
        current
          ? {
              ...current,
              status: "failed",
              message,
              steps: appendStep(current, message, current.percent)
            }
          : {
              jobId: "stop-all",
              label: "Parar todo proceso",
              status: "failed",
              percent: 100,
              message,
              startedAt: Date.now(),
              finishedAt: Date.now(),
              steps: [{ message, percent: 100, time: Date.now() }]
            }
      );
    }
  }

  const running = state?.status === "running";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ejecutar ahora</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {jobs.map((job) => (
            <Button
              key={job.id}
              type="button"
              variant={job.variant || "outline"}
              disabled={running}
              onClick={() => void runJob(job)}
            >
              {job.icon}
              {job.label}
            </Button>
          ))}
          <Button type="button" variant="danger" onClick={() => void stopAllJobs()}>
            <Square className="h-4 w-4" aria-hidden />
            Parar todo proceso
          </Button>
        </div>

        {state ? (
          <div className="rounded-lg border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{state.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{state.message}</p>
              </div>
              <span
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  state.status === "failed"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : state.status === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-border bg-card text-muted-foreground"
                )}
              >
                {state.status === "running" ? "En curso" : state.status === "success" ? "Terminado" : "Error"}
              </span>
            </div>

            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}>
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    state.status === "failed" ? "bg-destructive" : "bg-primary"
                  )}
                  style={{ width: `${state.percent}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                <span>{state.percent}% completado</span>
                {timing ? (
                  <span>
                    Transcurrido: {timing.elapsed}
                    {timing.remaining && state.status === "running" ? ` - Restante estimado: ${timing.remaining}` : null}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Actividad</p>
              <ol className="mt-2 space-y-1.5">
                {state.steps.map((step) => (
                  <li key={`${step.time}-${step.percent}-${step.message}`} className="flex gap-2 text-xs leading-5 text-muted-foreground">
                    <span className="w-10 shrink-0 tabular-nums">{step.percent}%</span>
                    <span>{step.message}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {typeof state.processedCount === "number" ? (
                <span>
                  {state.processedCount}
                  {state.totalCount ? `/${state.totalCount}` : ""} procesados
                </span>
              ) : null}
              {typeof state.successCount === "number" ? <span>{state.successCount} OK</span> : null}
              {typeof state.failedCount === "number" ? <span>{state.failedCount} errores</span> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
