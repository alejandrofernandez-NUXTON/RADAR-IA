import { JobRunner } from "@/components/admin/job-runner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const [runs, errors, lastNews, lastTraining, lastTelegram] = await Promise.all([
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.logEntry.findMany({ where: { level: { in: ["warn", "error"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.jobRun.findFirst({ where: { jobType: "news_analysis" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "training_search" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "telegram_send_pending" }, orderBy: { startedAt: "desc" } })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Automatizaciones</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ejecuciones, errores recientes y disparadores manuales.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <LastRun title="Noticias" run={lastNews} />
        <LastRun title="Formaciones" run={lastTraining} />
        <LastRun title="Telegram" run={lastTelegram} />
      </section>

      <JobRunner />

      <Card>
        <CardHeader>
          <CardTitle>Historial de jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Job</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Inicio</th>
                  <th className="py-2">Fin</th>
                  <th className="py-2">Procesados</th>
                  <th className="py-2">OK</th>
                  <th className="py-2">Errores</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="py-3 font-medium">{run.jobType}</td>
                    <td className="py-3">
                      <Badge tone={run.status === "FAILED" ? "danger" : run.status === "SUCCESS" ? "high" : "medium"}>{run.status}</Badge>
                    </td>
                    <td className="py-3">{formatDate(run.startedAt)}</td>
                    <td className="py-3">{formatDate(run.finishedAt)}</td>
                    <td className="py-3">{run.processedCount}</td>
                    <td className="py-3">{run.successCount}</td>
                    <td className="py-3">{run.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Errores recientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {errors.length ? (
            errors.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={entry.level === "error" ? "danger" : "medium"}>{entry.level}</Badge>
                  <Badge tone="muted">{entry.scope}</Badge>
                  <Badge tone="neutral">{formatDate(entry.createdAt)}</Badge>
                </div>
                <p className="mt-2 text-muted-foreground">{entry.message}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sin errores recientes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LastRun({ title, run }: { title: string; run: { status: string; startedAt: Date; processedCount: number; failedCount: number } | null }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
        <p className="mt-2 text-sm">{run ? formatDate(run.startedAt) : "Sin ejecuciones"}</p>
        <div className="mt-3 flex gap-2">
          <Badge tone={run?.status === "SUCCESS" ? "high" : run?.status === "FAILED" ? "danger" : "medium"}>{run?.status || "pendiente"}</Badge>
          {run ? <Badge tone="muted">{run.processedCount} procesados</Badge> : null}
          {run?.failedCount ? <Badge tone="danger">{run.failedCount} errores</Badge> : null}
        </div>
      </CardContent>
    </Card>
  );
}
