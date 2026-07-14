"use client";

import { AlertTriangle, RefreshCw, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runStreamedJob } from "@/lib/client/streamed-job";

type ActionState = { status: "idle" | "running" | "success" | "error"; message: string; percent: number };
type RuntimeJob = {
  jobType: string;
  status: "running" | "success" | "failed";
  percent: number;
  message: string;
};

export function VideoDigestActions({
  videoDigestId,
  status,
  deliveryUncertain
}: {
  videoDigestId: string;
  status: string;
  deliveryUncertain: boolean;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<"send" | "cancel" | null>(null);
  const [state, setState] = useState<ActionState>({ status: "idle", message: "", percent: 0 });
  const busy = state.status === "running";
  const canSend = status === "READY" || status === "SEND_FAILED";
  const canRegenerate = ["READY", "GENERATION_FAILED", "SEND_FAILED"].includes(status);
  const canCancel = !["SENT", "CANCELLED", "SENDING"].includes(status);

  useEffect(() => {
    if (status !== "GENERATING") return;
    let disposed = false;

    async function poll() {
      try {
        const response = await fetch("/api/jobs/status", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { jobs?: RuntimeJob[] };
        const job = payload.jobs?.find((candidate) =>
          candidate.jobType === "video_generate_pending" || candidate.jobType === "video_regenerate"
        );
        if (!job || disposed) return;
        setState({
          status: job.status === "running" ? "running" : job.status === "success" ? "success" : "error",
          message: job.message,
          percent: job.percent
        });
        if (job.status !== "running") router.refresh();
      } catch {
        // The next poll can recover from a transient admin API failure.
      }
    }

    void poll();
    const interval = window.setInterval(() => void poll(), 1500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [router, status]);

  async function post(action: "send" | "cancel" | "confirm-not-delivered") {
    setConfirmation(null);
    setState({ status: "running", message: action === "send" ? "Subiendo video a Telegram..." : "Aplicando accion...", percent: 20 });
    try {
      const response = await fetch(`/api/admin/video-digests/${videoDigestId}/${action}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || `El servidor devolvio ${response.status}.`);
      setState({ status: "success", message: action === "send" ? "Telegram confirmo el envio." : "Accion completada.", percent: 100 });
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "No se pudo completar la accion.", percent: 100 });
    }
  }

  async function regenerate() {
    setState({ status: "running", message: "Preparando regeneracion...", percent: 1 });
    try {
      const result = await runStreamedJob(`/api/jobs/video/${videoDigestId}/regenerate`, (progress) => {
        setState({ status: "running", message: progress.message, percent: progress.percent });
      });
      if (result.status === "FAILED") throw new Error(result.errorMessage || "La regeneracion ha fallado.");
      setState({ status: "success", message: "Video regenerado y listo para revision.", percent: 100 });
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "No se pudo regenerar.", percent: 100 });
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canSend && !deliveryUncertain ? <Button type="button" disabled={busy} onClick={() => setConfirmation("send")}><Send className="h-4 w-4" />Enviar video a Telegram</Button> : null}
        {canRegenerate ? <Button type="button" variant="outline" disabled={busy} onClick={() => void regenerate()}><RefreshCw className="h-4 w-4" />Regenerar</Button> : null}
        {canCancel ? <Button type="button" variant="danger" disabled={busy} onClick={() => setConfirmation("cancel")}><XCircle className="h-4 w-4" />Cancelar y liberar</Button> : null}
      </div>

      {confirmation ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">{confirmation === "send" ? "El video se enviara ahora al grupo configurado. Esta accion no se ejecuta automaticamente." : "El video se cancelara y sus noticias volveran a estar disponibles."}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant={confirmation === "cancel" ? "danger" : "primary"} onClick={() => void post(confirmation)}>Confirmar</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmation(null)}>Volver</Button>
          </div>
        </div>
      ) : null}

      {deliveryUncertain ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-950">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />No se pudo saber si Telegram recibio el video.</p>
          <p className="mt-1 text-red-800">Comprueba el grupo. Solo confirma lo siguiente si el video no aparece alli.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => void post("confirm-not-delivered")}>Confirmo que no se recibio</Button>
        </div>
      ) : null}

      {state.status !== "idle" ? (
        <div className={`rounded-md border p-3 text-sm ${state.status === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-border bg-muted/30"}`}>
          <p>{state.message}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background"><div className={`h-full ${state.status === "error" ? "bg-destructive" : "bg-primary"}`} style={{ width: `${state.percent}%` }} /></div>
        </div>
      ) : null}
    </div>
  );
}
