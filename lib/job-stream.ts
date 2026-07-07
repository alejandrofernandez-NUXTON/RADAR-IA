import type { JobRun } from "@prisma/client";
import type { JobProgressReporter } from "@/lib/types";

function serializeJob(job: JobRun) {
  return {
    ...job,
    startedAt: job.startedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() || null
  };
}

export function streamJob(handler: (progress: JobProgressReporter) => Promise<JobRun>) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(payload: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      }

      try {
        const job = await handler((progress) => {
          send({ type: "progress", progress });
        });
        send({ type: "complete", job: serializeJob(job) });
      } catch (error) {
        send({
          type: "error",
          error: error instanceof Error ? error.message : String(error)
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8"
    }
  });
}
