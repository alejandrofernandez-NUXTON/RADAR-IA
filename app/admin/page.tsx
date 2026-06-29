import { BookOpen, Database, Newspaper, Send, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [newsCount, sourceCount, trainingCount, sentCount, latestJobs] = await Promise.all([
    prisma.newsItem.count(),
    prisma.source.count(),
    prisma.trainingItem.count(),
    prisma.telegramMessage.count({ where: { status: "SENT" } }),
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 5 })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Panel de administracion</h1>
        <p className="mt-2 text-sm text-muted-foreground">Estado operativo del radar, fuentes, formaciones y automatizaciones.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Newspaper} label="Noticias" value={newsCount} />
        <Metric icon={Database} label="Fuentes" value={sourceCount} />
        <Metric icon={BookOpen} label="Formaciones" value={trainingCount} />
        <Metric icon={Send} label="Telegram" value={sentCount} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ultimas ejecuciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Job</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Inicio</th>
                  <th className="py-2">Procesados</th>
                  <th className="py-2">OK</th>
                  <th className="py-2">Errores</th>
                </tr>
              </thead>
              <tbody>
                {latestJobs.map((job) => (
                  <tr key={job.id} className="border-t border-border">
                    <td className="py-3 font-medium">{job.jobType}</td>
                    <td className="py-3">{job.status}</td>
                    <td className="py-3">{formatDate(job.startedAt)}</td>
                    <td className="py-3">{job.processedCount}</td>
                    <td className="py-3">{job.successCount}</td>
                    <td className="py-3">{job.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </CardContent>
    </Card>
  );
}
