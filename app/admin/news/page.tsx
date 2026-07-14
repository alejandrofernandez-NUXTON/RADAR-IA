import { NewsStatus, type Prisma } from "@prisma/client";
import Link from "next/link";
import { Eye, RefreshCcw, Send, Star, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  deleteNewsAction,
  reprocessNewsAction,
  sendNewsToTelegramAction,
  setNewsStatusAction,
  toggleNewsFeaturedAction
} from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { SettingsService } from "@/lib/services/settings-service";
import { pendingTelegramWhere } from "@/lib/services/telegram-pending-news-service";
import { asStringArray, formatDate, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] : current || "";
}

export default async function AdminNewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = value(params, "status");
  const delivery = value(params, "delivery");
  const query = value(params, "q").toLowerCase();
  const settings = await SettingsService.getAll();
  const filters: Prisma.NewsItemWhereInput[] = [];
  if (status) filters.push({ status: status as NewsStatus });
  if (delivery === "telegram_pending") filters.push(pendingTelegramWhere(settings.telegramThreshold));
  if (delivery === "video_reserved") filters.push({ videoDigestReservationId: { not: null } });

  const items = await prisma.newsItem.findMany({
    where: filters.length ? { AND: filters } : undefined,
    include: {
      source: true,
      telegramMessages: { orderBy: { createdAt: "desc" }, take: 1 },
      videoDigestReservation: { select: { id: true, status: true, title: true } },
      videoDigestItems: { include: { videoDigest: { select: { id: true, status: true } } }, orderBy: { createdAt: "desc" } }
    },
    orderBy: [{ status: "asc" }, { overallScore: "desc" }, { createdAt: "desc" }],
    take: 120
  });

  const filtered = query
    ? items.filter((item) => [item.title, item.shortSummary, item.whyItMatters, ...asStringArray(item.tags)].join(" ").toLowerCase().includes(query))
    : items;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Noticias detectadas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Revision editorial, reanalisis y envio manual a Telegram.</p>
      </div>

      <Card>
        <CardContent className="py-4">
          <form className="grid gap-3 md:grid-cols-5">
            <Input name="q" defaultValue={query} placeholder="Buscar" className="md:col-span-2" />
            <Select name="status" defaultValue={status}>
              <option value="">Todos</option>
              <option value="REVIEW">Pendiente</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="SENT_TO_TELEGRAM">Telegram</option>
              <option value="DISCARDED">Descartado</option>
              <option value="ERROR">Error</option>
            </Select>
            <Select name="delivery" defaultValue={delivery}>
              <option value="">Todos los estados de entrega</option>
              <option value="telegram_pending">Pendientes de Telegram</option>
              <option value="video_reserved">Reservadas para video</option>
            </Select>
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{filtered.length} noticias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Noticia</th>
                  <th className="py-2">Fuente</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Telegram</th>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="max-w-[380px] py-3">
                      <div className="flex items-start gap-2">
                        {item.featured ? <Star className="mt-1 h-4 w-4 shrink-0 text-amber-500" aria-hidden /> : null}
                        <div>
                          <p className="font-medium leading-6">{item.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.shortSummary}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">{item.source?.name || "Sin fuente"}</td>
                    <td className="py-3">{item.overallScore}</td>
                    <td className="py-3">
                      <Badge tone={item.status === "ERROR" ? "danger" : "neutral"}>{statusLabel(item.status)}</Badge>
                    </td>
                    <td className="py-3">
                      <DeliveryState item={item} telegramThreshold={settings.telegramThreshold} />
                    </td>
                    <td className="py-3">{formatDate(item.createdAt)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/news/${item.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted" title="Ver detalle">
                          <Eye className="h-4 w-4" aria-hidden />
                        </Link>
                        <StatusForm id={item.id} status="PUBLISHED" title="Aprobar" disabled={Boolean(item.videoDigestReservationId)} icon={<ThumbsUp className="h-4 w-4" aria-hidden />} />
                        <StatusForm id={item.id} status="DISCARDED" title="Descartar" disabled={Boolean(item.videoDigestReservationId)} icon={<ThumbsDown className="h-4 w-4" aria-hidden />} />
                        <form action={toggleNewsFeaturedAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title="Destacar">
                            <Star className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={sendNewsToTelegramAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title={item.videoDigestReservationId ? "Reservada para video" : "Enviar a Telegram"} disabled={Boolean(item.videoDigestReservationId)}>
                            <Send className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={reprocessNewsAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title={item.videoDigestReservationId ? "Cancela el video antes de reprocesar" : "Reprocesar"} disabled={Boolean(item.videoDigestReservationId)}>
                            <RefreshCcw className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={deleteNewsAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="danger" size="icon" title={item.videoDigestReservationId ? "Cancela el video antes de eliminar" : "Eliminar noticia"} disabled={Boolean(item.videoDigestReservationId)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                      </div>
                    </td>
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

function StatusForm({ id, status, title, icon, disabled = false }: { id: string; status: string; title: string; icon: React.ReactNode; disabled?: boolean }) {
  return (
    <form action={setNewsStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button variant="outline" size="icon" title={disabled ? "La noticia esta reservada para un video" : title} disabled={disabled}>
        {icon}
      </Button>
    </form>
  );
}

type DeliveryItem = {
  status: NewsStatus;
  telegramWorthy: boolean;
  overallScore: number;
  sentToTelegramAt: Date | null;
  videoDigestReservation: { id: string; status: string; title: string | null } | null;
  telegramMessages: Array<{ status: string; kind: string }>;
  videoDigestItems: Array<{ videoDigest: { id: string; status: string } }>;
};

function DeliveryState({ item, telegramThreshold }: { item: DeliveryItem; telegramThreshold: number }) {
  const sentVideo = item.videoDigestItems.find((entry) => entry.videoDigest.status === "SENT");
  if (item.videoDigestReservation) {
    const label = item.videoDigestReservation.status === "READY" ? "Incluida en video listo" : "Reservada para video";
    return <Link href={`/admin/videos/${item.videoDigestReservation.id}`}><Badge tone={item.videoDigestReservation.status === "READY" ? "high" : "medium"}>{label}</Badge></Link>;
  }
  if (sentVideo) return <Link href={`/admin/videos/${sentVideo.videoDigest.id}`}><Badge tone="high">Enviada mediante video</Badge></Link>;
  const message = item.telegramMessages[0];
  if (item.sentToTelegramAt || message?.status === "SENT") return <Badge tone="high">Enviada individualmente</Badge>;
  if (message?.status === "FAILED") return <Badge tone="danger">Error de envio</Badge>;
  if (item.status === NewsStatus.PUBLISHED && item.telegramWorthy && item.overallScore >= telegramThreshold) {
    return <Badge tone="medium">Pendiente de Telegram</Badge>;
  }
  return <span className="text-xs text-muted-foreground">No elegible</span>;
}
