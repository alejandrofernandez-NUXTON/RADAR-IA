import Link from "next/link";
import { VideoDigestStatus } from "@prisma/client";
import { Film, LockKeyhole, Send, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { TelegramPendingNewsService } from "@/lib/services/telegram-pending-news-service";
import { formatDate, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const filters = [
  ["all", "Todos"],
  [VideoDigestStatus.GENERATING, "Generando"],
  [VideoDigestStatus.READY, "Listos"],
  [VideoDigestStatus.GENERATION_FAILED, "Error de generacion"],
  [VideoDigestStatus.SEND_FAILED, "Error de envio"],
  [VideoDigestStatus.SENT, "Enviados"],
  [VideoDigestStatus.CANCELLED, "Cancelados"]
] as const;

export default async function VideosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selected = typeof params.status === "string" ? params.status : "all";
  const status = Object.values(VideoDigestStatus).includes(selected as VideoDigestStatus)
    ? (selected as VideoDigestStatus)
    : undefined;
  const pendingService = new TelegramPendingNewsService();
  const [pendingCount, reservedCount, readyCount, digests] = await Promise.all([
    pendingService.countEligibleNews(),
    prisma.newsItem.count({ where: { videoDigestReservationId: { not: null } } }),
    prisma.videoDigest.count({ where: { status: VideoDigestStatus.READY } }),
    prisma.videoDigest.findMany({
      where: status ? { status } : undefined,
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Videos explicativos</h1>
        <p className="mt-2 text-sm text-muted-foreground">Lotes de noticias preparados para revision y envio manual.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Send className="h-4 w-4" />} label="Pendientes elegibles" value={pendingCount} />
        <Metric icon={<LockKeyhole className="h-4 w-4" />} label="Noticias reservadas" value={reservedCount} />
        <Metric icon={<Video className="h-4 w-4" />} label="Videos listos" value={readyCount} />
      </section>

      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={value === "all" ? "/admin/videos" : `/admin/videos?status=${value}`}
            className={`rounded-md border px-3 py-2 text-sm ${selected === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {digests.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Video</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Noticias</th>
                    <th className="px-5 py-3">Duracion</th>
                    <th className="px-5 py-3">Tamano</th>
                    <th className="px-5 py-3">Intentos</th>
                    <th className="px-5 py-3">Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {digests.map((digest) => (
                    <tr key={digest.id} className="border-b border-border last:border-0 hover:bg-muted/25">
                      <td className="px-5 py-4">
                        <Link href={`/admin/videos/${digest.id}`} className="font-medium hover:underline">
                          {digest.title || `Video ${digest.id.slice(-8)}`}
                        </Link>
                        {digest.errorMessage ? <p className="mt-1 max-w-md truncate text-xs text-red-700">{digest.errorMessage}</p> : null}
                      </td>
                      <td className="px-5 py-4"><Badge tone={statusTone(digest.status)}>{statusLabel(digest.status)}</Badge></td>
                      <td className="px-5 py-4">{digest._count.items}</td>
                      <td className="px-5 py-4">{formatDuration(digest.durationSeconds)}</td>
                      <td className="px-5 py-4">{formatBytes(digest.sizeBytes)}</td>
                      <td className="px-5 py-4">{digest.generationAttempts} gen. / {digest.sendAttempts} env.</td>
                      <td className="px-5 py-4">{formatDate(digest.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <Film className="mx-auto mb-3 h-8 w-8" />
              No hay videos en este filtro.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4"><span className="text-muted-foreground">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div></CardContent></Card>
  );
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
