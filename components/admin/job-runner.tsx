"use client";

import { PlayCircle, Send, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type JobButton = {
  id: string;
  label: string;
  endpoint: string;
  variant?: "primary" | "outline";
  icon: ReactNode;
};

type ProgressPayload = {
  percent: number;
  message: string;
  processedCount?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
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
};

const jobs: JobButton[] = [
  {
    id: "news-search",
    label: "Buscar noticias ahora",
    endpoint: "/api/jobs/news/run",
    variant: "primary",
    icon: <Sparkles className="h-4 w-4" aria-hidden />
  },
  {
    id: "news-analysis",
    label: "Analizar fuentes ahora",
    endpoint: "/api/jobs/news/run",
    variant: "outline",
    icon: <PlayCircle className="h-4 w-4" aria-hidden />
  },
  {
    id: "training",
    label: "Buscar formaciones ahora",
    endpoint: "/api/jobs/training/run",
    variant: "outline",
    icon: <PlayCircle className="h-4 w-4" aria-hidden />
  },
  {
    id: "telegram",
    label: "Enviar pendientes a Telegram",
    endpoint: "/api/jobs/telegram/send-pending",
    variant: "outline",
    icon: <Send className="h-4 w-4" aria-hidden />
  }
];

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function JobRunner() {
  const router = useRouter();
  const [state, setState] = useState<RunnerState | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
    setState({
      jobId: job.id,
      label: job.label,
      status: "running",
      percent: 1,
      message: "Conectando con el job...",
      startedAt
    });

    try {
      const response = await fetch(`${job.endpoint}?stream=1`, { method: "POST" });
      if (!response.ok) throw new Error(`El servidor devolvio ${response.status}.`);
      if (!response.body) throw new Error("El servidor no devolvio flujo de progreso.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: "progress" | "complete" | "error";
            progress?: ProgressPayload;
            error?: string;
            job?: {
              status: string;
              processedCount: number;
              successCount: number;
              failedCount: number;
            };
          };

          if (event.type === "progress" && event.progress) {
            const progress = event.progress;
            setState((current) =>
              current
                ? {
                    ...current,
                    percent: clampPercent(progress.percent),
                    message: progress.message,
                    processedCount: progress.processedCount,
                    totalCount: progress.totalCount,
                    successCount: progress.successCount,
                    failedCount: progress.failedCount
                  }
                : current
            );
          }

          if (event.type === "complete" && event.job) {
            const jobResult = event.job;
            setState((current) =>
              current
                ? {
                    ...current,
                    status: jobResult.status === "FAILED" ? "failed" : "success",
                    percent: 100,
                    message: jobResult.status === "FAILED" ? "Job terminado con error." : "Job terminado.",
                    finishedAt: Date.now(),
                    processedCount: jobResult.processedCount,
                    successCount: jobResult.successCount,
                    failedCount: jobResult.failedCount
                  }
                : current
            );
          }

          if (event.type === "error") {
            throw new Error(event.error || "Error ejecutando el job.");
          }
        }
      }

      router.refresh();
    } catch (error) {
      setState((current) =>
        current
          ? {
              ...current,
              status: "failed",
              percent: 100,
              message: error instanceof Error ? error.message : "Error ejecutando el job.",
              finishedAt: Date.now()
            }
          : current
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
                    {timing.remaining && state.status === "running" ? ` · Restante estimado: ${timing.remaining}` : null}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {typeof state.processedCount === "number" ? <span>{state.processedCount}{state.totalCount ? `/${state.totalCount}` : ""} procesados</span> : null}
              {typeof state.successCount === "number" ? <span>{state.successCount} OK</span> : null}
              {typeof state.failedCount === "number" ? <span>{state.failedCount} errores</span> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
