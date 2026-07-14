import Link from "next/link";
import { CheckCircle2, PauseCircle, PlayCircle } from "lucide-react";
import { JobRunner } from "@/components/admin/job-runner";
import { ScheduleStatusBox } from "@/components/admin/schedule-status-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { saveJobSchedulesAction, toggleJobSchedulesEnabledAction } from "@/lib/actions/admin-actions";
import { JOB_ENDPOINTS } from "@/lib/job-endpoints";
import { prisma } from "@/lib/prisma";
import { SettingsService, type JobScheduleConfig } from "@/lib/services/settings-service";
import { ScheduleService } from "@/lib/services/schedule-service";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const frequencies = [
  ["hourly", "Cada hora"],
  ["daily", "Cada dia"],
  ["weekly", "Cada semana"]
] as const;

const weekdays = [
  ["monday", "Lunes"],
  ["tuesday", "Martes"],
  ["wednesday", "Miercoles"],
  ["thursday", "Jueves"],
  ["friday", "Viernes"],
  ["saturday", "Sabado"],
  ["sunday", "Domingo"]
] as const;

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const scheduleSaved = params.schedule === "saved";
  const schedulePaused = params.schedule === "paused";
  const scheduleEnabled = params.schedule === "enabled";
  const [runs, errors, lastCollection, lastProcessing, lastNews, lastTraining, lastTelegram, lastVideo, settings] = await Promise.all([
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.logEntry.findMany({ where: { level: { in: ["warn", "error"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.jobRun.findFirst({ where: { jobType: "source_collection" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "news_processing" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "news_analysis" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "training_search" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "telegram_send_pending" }, orderBy: { startedAt: "desc" } }),
    prisma.jobRun.findFirst({ where: { jobType: "video_generate_pending" }, orderBy: { startedAt: "desc" } }),
    SettingsService.getAll()
  ]);
  const savedSchedules = await SettingsService.getJobScheduleSavedStates();
  const now = new Date();
  const scheduleStatus = {
    collect: {
      jobType: "source_collection",
      saved: savedSchedules.collect.saved,
      savedAt: savedSchedules.collect.savedAt?.toISOString() || null,
      nextRunAt: settings.jobSchedulesEnabled && savedSchedules.collect.saved
        ? ScheduleService.nextRun(settings.jobSchedules.collect, lastCollection?.startedAt || null, now, settings.timezone)?.toISOString() || null
        : null,
      text: scheduleSummary(settings.jobSchedules.collect)
    },
    process: {
      jobType: "news_processing",
      saved: savedSchedules.process.saved,
      savedAt: savedSchedules.process.savedAt?.toISOString() || null,
      nextRunAt: settings.jobSchedulesEnabled && savedSchedules.process.saved
        ? ScheduleService.nextRun(settings.jobSchedules.process, (lastProcessing || lastNews)?.startedAt || null, now, settings.timezone)?.toISOString() || null
        : null,
      text: scheduleSummary(settings.jobSchedules.process)
    },
    telegram: {
      jobType: "telegram_send_pending",
      saved: savedSchedules.telegram.saved,
      savedAt: savedSchedules.telegram.savedAt?.toISOString() || null,
      nextRunAt: settings.jobSchedulesEnabled && savedSchedules.telegram.saved
        ? ScheduleService.nextRun(settings.jobSchedules.telegram, lastTelegram?.startedAt || null, now, settings.timezone)?.toISOString() || null
        : null,
      text: scheduleSummary(settings.jobSchedules.telegram)
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Automatizaciones</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ejecuciones, horarios y disparadores manuales.</p>
        </div>
        {scheduleSaved ? (
          <Badge tone="high">
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
            Programacion guardada
          </Badge>
        ) : null}
        {schedulePaused ? (
          <Badge tone="medium">
            <PauseCircle className="mr-1 h-3 w-3" aria-hidden />
            Contadores pausados
          </Badge>
        ) : null}
        {scheduleEnabled ? (
          <Badge tone="high">
            <PlayCircle className="mr-1 h-3 w-3" aria-hidden />
            Contadores activos
          </Badge>
        ) : null}
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <LastRun title="Recogida" run={lastCollection} />
        <LastRun title="Procesado" run={lastProcessing || lastNews} />
        <LastRun title="Formaciones" run={lastTraining} />
        <LastRun title="Telegram" run={lastTelegram} />
        <LastVideoRun run={lastVideo} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Programacion automatica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={saveJobSchedulesAction} className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <SchedulePanel
                title="Recoger publicaciones"
                description="Consulta la ultima publicacion de cada fuente activa y la deja pendiente de analisis."
                prefix="collect"
                schedule={settings.jobSchedules.collect}
                status={scheduleStatus.collect}
                endpoint={JOB_ENDPOINTS.sourceCollection}
                jobLabel="Recoger publicaciones"
                automationEnabled={settings.jobSchedulesEnabled}
              />
              <SchedulePanel
                title="Procesar con Gemini"
                description="Analiza las publicaciones recogidas, calcula relevancia y decide si se publican."
                prefix="process"
                schedule={settings.jobSchedules.process}
                status={scheduleStatus.process}
                endpoint={JOB_ENDPOINTS.newsProcessing}
                jobLabel="Procesar pendientes con Gemini"
                automationEnabled={settings.jobSchedulesEnabled}
              />
              <SchedulePanel
                title="Enviar a Telegram"
                description={settings.telegramDeliveryMode === "video_digest_manual" ? "Omitido en modo video: los videos READY solo se envian por orden del administrador." : "Envia al grupo las noticias publicadas que superen el umbral y aun no se hayan enviado."}
                prefix="telegram"
                schedule={settings.jobSchedules.telegram}
                status={scheduleStatus.telegram}
                endpoint={JOB_ENDPOINTS.telegramPending}
                jobLabel="Enviar pendientes a Telegram"
                automationEnabled={settings.jobSchedulesEnabled}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit">Guardar programacion</Button>
              <p className="text-xs text-muted-foreground">
                Zona horaria: {settings.timezone}. En modo cada hora, la hora se usa solo como referencia visual.
              </p>
            </div>
          </form>
          <form action={toggleJobSchedulesEnabledAction} className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <input type="hidden" name="enabled" value={settings.jobSchedulesEnabled ? "false" : "true"} />
            <Button type="submit" variant={settings.jobSchedulesEnabled ? "danger" : "outline"}>
              {settings.jobSchedulesEnabled ? (
                <PauseCircle className="h-4 w-4" aria-hidden />
              ) : (
                <PlayCircle className="h-4 w-4" aria-hidden />
              )}
              {settings.jobSchedulesEnabled ? "Parar contadores automaticos" : "Reactivar contadores automaticos"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              {settings.jobSchedulesEnabled
                ? "Pausa los tres contadores y evita que se ejecuten jobs al llegar a cero."
                : "Los botones de ejecutar ahora siguen disponibles aunque la programacion automatica este pausada."}
            </p>
          </form>
        </CardContent>
      </Card>

      <JobRunner deliveryMode={settings.telegramDeliveryMode} videoEnabled={settings.video.enabled} />

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

function SchedulePanel({
  title,
  description,
  prefix,
  schedule,
  status,
  endpoint,
  jobLabel,
  automationEnabled
}: {
  title: string;
  description: string;
  prefix: "collect" | "process" | "telegram";
  schedule: JobScheduleConfig;
  endpoint: string;
  jobLabel: string;
  automationEnabled: boolean;
  status: {
    jobType: string;
    saved: boolean;
    savedAt: string | null;
    nextRunAt: string | null;
    text: string;
  };
}) {
  return (
    <div className="flex min-h-full flex-col rounded-md border border-border bg-background p-4">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4 grid gap-3">
        <Field label="Frecuencia">
          <Select name={`${prefix}Frequency`} defaultValue={schedule.frequency}>
            {frequencies.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hora">
          <Input name={`${prefix}Time`} type="time" defaultValue={schedule.time} />
        </Field>
        <Field label="Dia semanal">
          <Select name={`${prefix}Weekday`} defaultValue={schedule.weekday}>
            {weekdays.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4">
        <ScheduleStatusBox
          jobType={status.jobType}
          endpoint={endpoint}
          jobLabel={jobLabel}
          automationEnabled={automationEnabled}
          hasSchedule={status.saved}
          scheduleText={status.text}
          nextRunAt={status.nextRunAt}
          savedAt={status.savedAt}
        />
      </div>
    </div>
  );
}

function scheduleSummary(schedule: JobScheduleConfig) {
  const frequency = frequencies.find(([value]) => value === schedule.frequency)?.[1] || schedule.frequency;
  const weekday = weekdays.find(([value]) => value === schedule.weekday)?.[1] || schedule.weekday;

  if (schedule.frequency === "hourly") return `${frequency}. Minuto de referencia: ${schedule.time.split(":")[1] || "00"}.`;
  if (schedule.frequency === "daily") return `${frequency} a las ${schedule.time}.`;
  return `${frequency}, ${weekday.toLowerCase()} a las ${schedule.time}.`;
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

function LastVideoRun({
  run
}: {
  run: {
    status: string;
    startedAt: Date;
    processedCount: number;
    failedCount: number;
    metadata: unknown;
  } | null;
}) {
  const metadata = isRecord(run?.metadata) ? run.metadata : null;
  const digestId = typeof metadata?.digestId === "string" ? metadata.digestId : null;
  const durationSeconds = typeof metadata?.durationSeconds === "number" ? metadata.durationSeconds : null;
  const sizeBytes = typeof metadata?.sizeBytes === "number" ? metadata.sizeBytes : null;

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">Video</p>
        <p className="mt-2 text-sm">{run ? formatDate(run.startedAt) : "Sin ejecuciones"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={run?.status === "SUCCESS" ? "high" : run?.status === "FAILED" ? "danger" : "medium"}>{run?.status || "pendiente"}</Badge>
          {durationSeconds !== null ? <Badge tone="muted">{Math.floor(durationSeconds / 60)}:{String(durationSeconds % 60).padStart(2, "0")}</Badge> : null}
          {sizeBytes !== null ? <Badge tone="muted">{(sizeBytes / 1024 / 1024).toFixed(1)} MB</Badge> : null}
        </div>
        {digestId ? <Link href={`/admin/videos/${digestId}`} className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">Revisar video</Link> : null}
      </CardContent>
    </Card>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
