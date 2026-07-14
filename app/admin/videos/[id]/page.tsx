import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoDigestStatus } from "@prisma/client";
import { AlertTriangle, ArrowLeft, Clock, Database, FileVideo, Send } from "lucide-react";
import { VideoDigestActions } from "@/components/admin/video-digest-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TelegramPendingNewsService } from "@/lib/services/telegram-pending-news-service";
import { VideoDigestService } from "@/lib/services/video-digest-service";
import { formatDate, statusLabel } from "@/lib/utils";
import { newsSnapshotSchema } from "@/video/schemas/news-snapshot-schema";

export const dynamic = "force-dynamic";

export default async function VideoDigestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = new VideoDigestService();
  const pendingService = new TelegramPendingNewsService();
  const digest = await service.getDigest(id);
  if (!digest) notFound();

  let integrityWarning: string | null = null;
  if (digest.status === VideoDigestStatus.READY || digest.status === VideoDigestStatus.SEND_FAILED) {
    try {
      await pendingService.assertDigestStillSendable(digest.id);
    } catch (error) {
      integrityWarning = error instanceof Error ? error.message : "El contenido debe revisarse antes del envio.";
    }
  }
  const newPendingCount = await pendingService.countEligibleNews();
  const snapshots = digest.items.map((item) => ({ item, snapshot: newsSnapshotSchema.safeParse(item.contentSnapshot) }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/videos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Volver a videos
        </Link>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal">{digest.title || `Video ${digest.id.slice(-8)}`}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={statusTone(digest.status)}>{statusLabel(digest.status)}</Badge>
              <Badge tone="muted">{digest.items.length} noticias</Badge>
              <Badge tone="muted">Creado {formatDate(digest.createdAt)}</Badge>
            </div>
          </div>
          <div className="lg:max-w-xl"><VideoDigestActions videoDigestId={digest.id} status={digest.status} deliveryUncertain={digest.deliveryUncertain} /></div>
        </div>
      </div>

      {integrityWarning ? (
        <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-medium">Necesita regeneracion antes de enviarse</p><p className="mt-1 text-amber-800">{integrityWarning}</p></div>
        </div>
      ) : null}

      {digest.errorMessage ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">{digest.errorCode || "Error del video"}</p><p className="mt-1">{digest.errorMessage}</p>
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Info icon={<Clock className="h-4 w-4" />} label="Duracion" value={formatDuration(digest.durationSeconds)} />
        <Info icon={<FileVideo className="h-4 w-4" />} label="Archivo" value={formatBytes(digest.sizeBytes)} />
        <Info icon={<Database className="h-4 w-4" />} label="Render" value={digest.width && digest.height ? `${digest.width}x${digest.height} a ${digest.fps} FPS` : "Sin render"} />
        <Info icon={<Send className="h-4 w-4" />} label="Siguiente lote" value={`${newPendingCount} noticias pendientes nuevas`} />
      </section>

      {digest.videoStorageKey ? (
        <Card>
          <CardHeader><CardTitle>Previsualizacion protegida</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <video controls preload="metadata" poster={digest.thumbnailStorageKey ? `/api/admin/video-digests/${digest.id}/media?artifact=thumbnail` : undefined} className="aspect-video w-full bg-black">
              <source src={`/api/admin/video-digests/${digest.id}/media`} type="video/mp4" />
              Tu navegador no puede reproducir este MP4.
            </video>
            {digest.subtitleStorageKey ? <a href={`/api/admin/video-digests/${digest.id}/media?artifact=subtitles`} className="text-sm font-medium text-primary hover:underline">Abrir subtitulos SRT</a> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>Noticias incluidas</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {snapshots.map(({ item, snapshot }) => (
            <article key={item.id} className="px-5 py-5">
              {snapshot.success ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone="muted">#{item.position}</Badge><span className="text-xs text-muted-foreground">Snapshot {formatDate(snapshot.data.updatedAt)}</span></div>
                    <h2 className="mt-3 text-base font-semibold">{snapshot.data.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{snapshot.data.shortSummary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">{snapshot.data.tags.slice(0, 6).map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}</div>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs uppercase text-muted-foreground">Fuente utilizada</p>
                    <p className="mt-2 font-medium">{snapshot.data.source.name}</p>
                    <a href={snapshot.data.source.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-primary hover:underline">Abrir original</a>
                    {item.newsItemId ? <Link href={`/admin/news/${item.newsItemId}`} className="mt-3 block text-xs font-medium hover:underline">Ver noticia actual</Link> : null}
                  </div>
                </div>
              ) : <p className="text-sm text-red-700">El snapshot historico no tiene un formato valido.</p>}
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de Telegram</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {digest.telegramMessages.length ? digest.telegramMessages.map((message) => (
            <div key={message.id} className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-medium">{statusLabel(message.status)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(message.createdAt)}{message.telegramMessageId ? ` - Telegram #${message.telegramMessageId}` : ""}</p></div>
              {message.errorMessage ? <p className="max-w-xl text-xs text-red-700">{message.errorMessage}</p> : null}
            </div>
          )) : <p className="text-sm text-muted-foreground">Todavia no se ha intentado enviar este video.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-start gap-3 py-4"><span className="mt-0.5 text-muted-foreground">{icon}</span><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div></CardContent></Card>;
}

function statusTone(status: VideoDigestStatus): "high" | "medium" | "danger" | "muted" {
  if (status === VideoDigestStatus.READY || status === VideoDigestStatus.SENT) return "high";
  if (status === VideoDigestStatus.GENERATION_FAILED || status === VideoDigestStatus.SEND_FAILED) return "danger";
  if (status === VideoDigestStatus.CANCELLED) return "muted";
  return "medium";
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "Sin calcular";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatBytes(value: bigint | null) {
  if (!value) return "Sin calcular";
  return `${(Number(value) / 1024 / 1024).toFixed(1)} MB`;
}
