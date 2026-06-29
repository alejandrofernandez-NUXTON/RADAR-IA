import type { NewsItem, Source } from "@prisma/client";
import { ArrowUpRight, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score";
import { asStringArray, compactUrl, formatDate, statusLabel } from "@/lib/utils";

export function NewsCard({ item }: { item: NewsItem & { source: Source | null } }) {
  const tags = asStringArray(item.tags);
  const categories = asStringArray(item.categories);

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {item.featured ? (
            <Badge tone="medium">
              <Star className="mr-1 h-3 w-3" aria-hidden />
              Destacada
            </Badge>
          ) : null}
          <Badge tone="muted">{item.source?.name || compactUrl(item.sourceUrl)}</Badge>
          <Badge tone="neutral">{formatDate(item.publishedAt || item.createdAt)}</Badge>
          <ScoreBadge score={item.overallScore} label="Relevancia" />
          <Badge tone={item.status === "DISCARDED" || item.status === "ERROR" ? "danger" : "neutral"}>{statusLabel(item.status)}</Badge>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold leading-7">{item.title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{item.shortSummary}</p>
        </div>

        <div className="rounded-md border border-border bg-muted/45 p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Por que importa</p>
          <p className="mt-1 text-sm leading-6">{item.whyItMatters}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.slice(0, 3).map((category) => (
            <Badge key={category} tone="low">
              {category}
            </Badge>
          ))}
          {tags.slice(0, 6).map((tag) => (
            <Badge key={tag} tone="muted">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <ButtonLink href={`/news/${item.id}`} variant="secondary" size="sm">
            Ver detalle
          </ButtonLink>
          <ButtonLink href={item.sourceUrl} variant="ghost" size="sm" target="_blank" rel="noreferrer">
            Fuente
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </div>
      </CardContent>
    </Card>
  );
}
