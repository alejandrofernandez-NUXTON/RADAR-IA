import { Power, Trash2 } from "lucide-react";
import { createSourceAction, deleteSourceAction, toggleSourceAction } from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const sourceTypes = [
  ["YOUTUBE_VIDEO", "YouTube video"],
  ["YOUTUBE_CHANNEL", "YouTube channel"],
  ["YOUTUBE_PLAYLIST", "YouTube playlist"],
  ["RSS_FEED", "RSS feed"],
  ["WEBSITE", "Website"],
  ["NEWSLETTER_MANUAL", "Newsletter/manual futuro"]
] as const;

export default async function SourcesPage() {
  const sources = await prisma.source.findMany({
    orderBy: [{ active: "desc" }, { priority: "desc" }, { name: "asc" }]
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Fuentes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Gestiona videos, playlists, canales y fuentes preparadas para RSS o web.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Anadir o actualizar fuente</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createSourceAction} className="grid gap-4 lg:grid-cols-2">
            <Field label="Nombre">
              <Input name="name" required />
            </Field>
            <Field label="Tipo">
              <Select name="type" defaultValue="YOUTUBE_VIDEO">
                {sourceTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="URL">
              <Input name="url" type="url" required placeholder="https://www.youtube.com/watch?v=..." />
            </Field>
            <Field label="Categoria">
              <Input name="category" required placeholder="agentes, productividad, modelos..." />
            </Field>
            <Field label="Idioma">
              <Input name="language" defaultValue="es" />
            </Field>
            <Field label="Prioridad">
              <Input name="priority" type="number" min="1" max="10" defaultValue="5" />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium lg:col-span-2">
              <input name="active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-border" />
              Activa
            </label>
            <div className="lg:col-span-2">
              <Field label="Notas internas">
                <Textarea name="notes" />
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Button type="submit">Guardar fuente</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fuentes configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Nombre</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2">Prioridad</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Ultimo proceso</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id} className="border-t border-border align-top">
                    <td className="max-w-[260px] py-3">
                      <p className="font-medium">{source.name}</p>
                      <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-muted-foreground">
                        {source.url}
                      </a>
                    </td>
                    <td className="py-3">{source.type}</td>
                    <td className="py-3">{source.category}</td>
                    <td className="py-3">{source.priority}</td>
                    <td className="py-3">
                      <Badge tone={source.active ? "high" : "muted"}>{source.active ? "Activa" : "Inactiva"}</Badge>
                    </td>
                    <td className="py-3">{formatDate(source.lastProcessedAt)}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <form action={toggleSourceAction}>
                          <input type="hidden" name="id" value={source.id} />
                          <Button variant="outline" size="icon" title="Activar o desactivar">
                            <Power className="h-4 w-4" aria-hidden />
                          </Button>
                        </form>
                        <form action={deleteSourceAction}>
                          <input type="hidden" name="id" value={source.id} />
                          <Button variant="danger" size="icon" title="Eliminar">
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
