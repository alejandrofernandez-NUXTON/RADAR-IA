import { NewsStatus } from "@prisma/client";
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
  const query = value(params, "q").toLowerCase();

  const items = await prisma.newsItem.findMany({
      where: status ? { status: status as NewsStatus } : undefined,
    include: { source: true, telegramMessages: { orderBy: { createdAt: "desc" }, take: 1 } },
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
          <form className="grid gap-3 md:grid-cols-4">
            <Input name="q" defaultValue={query} placeholder="Buscar" className="md:col-span-2" />
            <Select name="status" defaultValue={status}>
              <option value="">Todos</option>
              <option value="REVIEW">Pendiente</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="SENT_TO_TELEGRAM">Telegram</option>
              <option value="DISCARDED">Descartado</option>
              <option value="ERROR">Error</option>
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
                      {item.telegramMessages[0] ? <Badge tone={item.telegramMessages[0].status === "SENT" ? "high" : "medium"}>{statusLabel(item.telegramMessages[0].status)}</Badge> : "No"}
                    </td>
                    <td className="py-3">{formatDate(item.createdAt)}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/admin/news/${item.id}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted" title="Ver detalle">
                          <Eye className="h-4 w-4" aria-hidden />
                        </Link>
                        <StatusForm id={item.id} status="PUBLISHED" title="Aprobar" icon={<ThumbsUp className="h-4 w-4" aria-hidden />} />
                        <StatusForm id={item.id} status="DISCARDED" title="Descartar" icon={<ThumbsDown className="h-4 w-4" aria-hidden />} />
                        <form action={toggleNewsFeaturedAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title="Destacar">
                            <Star className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={sendNewsToTelegramAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title="Enviar a Telegram">
                            <Send className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={reprocessNewsAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="outline" size="icon" title="Reprocesar">
                            <RefreshCcw className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={deleteNewsAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <Button variant="danger" size="icon" title="Eliminar noticia">
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

function StatusForm({ id, status, title, icon }: { id: string; status: string; title: string; icon: React.ReactNode }) {
  return (
    <form action={setNewsStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button variant="outline" size="icon" title={title}>
        {icon}
      </Button>
    </form>
  );
}
