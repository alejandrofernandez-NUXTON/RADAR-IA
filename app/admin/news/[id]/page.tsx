import { notFound } from "next/navigation";
import { ArrowUpRight, RefreshCcw, Send } from "lucide-react";
import {
  reprocessNewsAction,
  sendNewsToTelegramAction,
  setNewsStatusAction,
  updateNewsContentAction
} from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { asStringArray, formatDate, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminNewsDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const saved = (await searchParams).saved === "1";
  const item = await prisma.newsItem.findUnique({
    where: { id },
    include: { source: true, telegramMessages: { orderBy: { createdAt: "desc" } } }
  });
  if (!item) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{statusLabel(item.status)}</Badge>
            <Badge tone="muted">{item.source?.name || "Sin fuente"}</Badge>
            <Badge tone="neutral">{formatDate(item.createdAt)}</Badge>
            {saved ? <Badge tone="high">Guardado</Badge> : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">{item.title}</h1>
        </div>
        <ButtonLink href={item.sourceUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
          Fuente
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editar contenido</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateNewsContentAction} className="space-y-4">
            <input type="hidden" name="id" value={item.id} />
            <Field label="Titulo">
              <Input name="title" defaultValue={item.title} required />
            </Field>
            <Field label="Resumen corto">
              <Textarea name="shortSummary" defaultValue={item.shortSummary} />
            </Field>
            <Field label="Resumen largo">
              <Textarea name="longSummary" className="min-h-48" defaultValue={item.longSummary} />
            </Field>
            <Field label="Por que importa">
              <Textarea name="whyItMatters" defaultValue={item.whyItMatters} />
            </Field>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Puntos clave">
                <Textarea name="keyPoints" defaultValue={asStringArray(item.keyPoints).join("\n")} />
              </Field>
              <Field label="Aplicaciones de negocio">
                <Textarea name="businessApplications" defaultValue={asStringArray(item.businessApplications).join("\n")} />
              </Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Categorias, separadas por coma">
                <Input name="categories" defaultValue={asStringArray(item.categories).join(", ")} />
              </Field>
              <Field label="Etiquetas, separadas por coma">
                <Input name="tags" defaultValue={asStringArray(item.tags).join(", ")} />
              </Field>
            </div>
            <Button type="submit">Guardar cambios</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <StatusButton id={item.id} status="PUBLISHED" label="Aprobar" />
          <StatusButton id={item.id} status="DISCARDED" label="Descartar" />
          <StatusButton id={item.id} status="REVIEW" label="Marcar pendiente" />
          <form action={sendNewsToTelegramAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button variant="outline" type="submit">
              <Send className="h-4 w-4" aria-hidden />
              Enviar a Telegram
            </Button>
          </form>
          <form action={reprocessNewsAction}>
            <input type="hidden" name="id" value={item.id} />
            <Button variant="outline" type="submit">
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Reprocesar con Gemini
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial Telegram</CardTitle>
        </CardHeader>
        <CardContent>
          {item.telegramMessages.length ? (
            <div className="space-y-3">
              {item.telegramMessages.map((message) => (
                <div key={message.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={message.status === "SENT" ? "high" : message.status === "FAILED" ? "danger" : "medium"}>{statusLabel(message.status)}</Badge>
                    <Badge tone="muted">{formatDate(message.sentAt || message.createdAt)}</Badge>
                  </div>
                  {message.errorMessage ? <p className="mt-2 text-red-700">{message.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin envios registrados.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setNewsStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button variant="secondary" type="submit">
        {label}
      </Button>
    </form>
  );
}
