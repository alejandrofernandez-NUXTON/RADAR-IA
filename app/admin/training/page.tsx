import { Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { setTrainingStatusAction, updateTrainingNoteAction } from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { asStringArray, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminTrainingPage() {
  const items = await prisma.trainingItem.findMany({
    orderBy: [{ status: "asc" }, { overallScore: "desc" }, { createdAt: "desc" }],
    take: 100
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Formaciones</h1>
        <p className="mt-2 text-sm text-muted-foreground">Revision de recursos gratuitos encontrados automaticamente.</p>
      </div>

      <div className="grid gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="muted">{item.provider}</Badge>
                    <Badge tone="neutral">{item.contentType}</Badge>
                    <Badge tone="neutral">{item.level}</Badge>
                    <Badge tone={item.status === "DISCARDED" ? "danger" : "neutral"}>{statusLabel(item.status)}</Badge>
                    <Badge tone={item.overallScore >= 75 ? "high" : "medium"}>Score {item.overallScore}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold leading-7">{item.title}</h2>
                  <p className="max-w-4xl text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary">
                  Abrir
                </a>
              </div>

              <div className="flex flex-wrap gap-2">
                {asStringArray(item.topics).slice(0, 8).map((topic) => (
                  <Badge key={topic} tone="low">
                    {topic}
                  </Badge>
                ))}
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6">
                {item.whyRecommended}
              </div>

              <div className="flex flex-wrap gap-2">
                <TrainingStatusForm id={item.id} status="PUBLISHED" label="Aprobar" icon={<ThumbsUp className="h-4 w-4" aria-hidden />} />
                <TrainingStatusForm id={item.id} status="DISCARDED" label="Descartar" icon={<ThumbsDown className="h-4 w-4" aria-hidden />} />
                <TrainingStatusForm id={item.id} status="FEATURED" label="Destacar" icon={<Star className="h-4 w-4" aria-hidden />} />
              </div>

              <form action={updateTrainingNoteAction} className="space-y-2">
                <input type="hidden" name="id" value={item.id} />
                <Textarea name="internalNote" defaultValue={item.internalNote || ""} placeholder="Nota interna" />
                <Button variant="secondary" size="sm" type="submit">
                  Guardar nota
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      {!items.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Sin formaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Ejecuta el job de busqueda desde Automatizaciones.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TrainingStatusForm({ id, status, label, icon }: { id: string; status: string; label: string; icon: React.ReactNode }) {
  return (
    <form action={setTrainingStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button variant="outline" size="sm" type="submit">
        {icon}
        {label}
      </Button>
    </form>
  );
}
