import type { TrainingItem } from "@prisma/client";
import { ArrowUpRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score";
import { asStringArray, statusLabel } from "@/lib/utils";

export function TrainingCard({ item }: { item: TrainingItem }) {
  const topics = asStringArray(item.topics);

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "FEATURED" ? (
            <Badge tone="medium">
              <Star className="mr-1 h-3 w-3" aria-hidden />
              Destacada
            </Badge>
          ) : null}
          <Badge tone="muted">{item.provider}</Badge>
          <Badge tone="neutral">{item.contentType}</Badge>
          <Badge tone="neutral">{item.level}</Badge>
          <ScoreBadge score={item.overallScore} label="Valoracion" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold leading-7">{item.title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Duracion</p>
            <p className="mt-1">{item.estimatedDuration}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Estado</p>
            <p className="mt-1">{statusLabel(item.status)}</p>
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/45 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Motivo</p>
          <p className="mt-1 text-sm leading-6">{item.whyRecommended}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {topics.slice(0, 6).map((topic) => (
            <Badge key={topic} tone="low">
              {topic}
            </Badge>
          ))}
        </div>
        <ButtonLink href={item.url} target="_blank" rel="noreferrer" variant="secondary" size="sm">
          Abrir recurso
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      </CardContent>
    </Card>
  );
}
