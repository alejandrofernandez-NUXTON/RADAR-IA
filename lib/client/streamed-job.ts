export type ProgressPayload = {
  percent: number;
  message: string;
  processedCount?: number;
  totalCount?: number;
  successCount?: number;
  failedCount?: number;
};

export type StreamedJobResult = {
  status: string;
  processedCount: number;
  successCount: number;
  failedCount: number;
  errorMessage?: string | null;
};

type StreamedJobEvent = {
  type: "progress" | "complete" | "error";
  progress?: ProgressPayload;
  error?: string;
  job?: StreamedJobResult;
};

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function runStreamedJob(endpoint: string, onProgress: (progress: ProgressPayload) => void) {
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("stream", "1");
  const response = await fetch(`${url.pathname}${url.search}`, { method: "POST" });
  if (!response.ok) throw new Error(`El servidor devolvio ${response.status}.`);
  if (!response.body) throw new Error("El servidor no devolvio flujo de progreso.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: StreamedJobResult | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StreamedJobEvent;

      if (event.type === "progress" && event.progress) {
        onProgress(event.progress);
      }

      if (event.type === "complete" && event.job) {
        result = event.job;
      }

      if (event.type === "error") {
        throw new Error(event.error || "Error ejecutando el job.");
      }
    }
  }

  if (!result) throw new Error("El job termino sin respuesta final.");
  return result;
}
