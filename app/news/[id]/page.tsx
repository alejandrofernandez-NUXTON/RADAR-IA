import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { MainNav } from "@/components/main-nav";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreBadge } from "@/components/ui/score";
import { prisma } from "@/lib/prisma";
import { asStringArray, formatDate, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function NewsDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const item = await prisma.newsItem.findUnique({ where: { id }, include: { source: true, telegramMessages: true } });
  if (!item) notFound();

  const keyPoints = asStringArray(item.keyPoints);
  const applications = asStringArray(item.businessApplications);
  const tools = asStringArray(item.toolsMentioned);
  const companies = asStringArray(item.companiesMentioned);
  const related = [...tools, ...companies].slice(0, 10);

  return (
    <>
      <MainNav />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="muted">{item.source?.name || "Fuente externa"}</Badge>
            <Badge tone="neutral">{formatDate(item.publishedAt || item.createdAt)}</Badge>
            <Badge tone="neutral">{statusLabel(item.status)}</Badge>
            <ScoreBadge score={item.overallScore} label="Relevancia" />
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-normal">{item.title}</h1>
          <p className="text-base leading-7 text-muted-foreground">{item.shortSummary}</p>
          <ButtonLink href={item.sourceUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
            Abrir fuente original
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-7 text-muted-foreground">{item.longSummary}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoList title="Puntos clave" items={keyPoints} />
          <InfoList title="Aplicaciones para la empresa" items={applications} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Por que importa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-7 text-muted-foreground">{item.whyItMatters}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Riesgos o limites</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-7 text-muted-foreground">
                Validar fuente, disponibilidad real de la herramienta, costes, privacidad de datos y dependencia de proveedor antes de convertirlo en piloto.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Links y entidades relacionadas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {related.length ? related.map((item) => <Badge key={item}>{item}</Badge>) : <p className="text-sm text-muted-foreground">Sin entidades detectadas.</p>}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length ? (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item} className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos.</p>
        )}
      </CardContent>
    </Card>
  );
}
