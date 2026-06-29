import { NewsStatus } from "@prisma/client";
import { MainNav } from "@/components/main-nav";
import { NewsCard } from "@/components/news-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { prisma } from "@/lib/prisma";
import { asStringArray } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] : current || "";
}

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = value(params, "q").toLowerCase();
  const sourceId = value(params, "source");
  const status = value(params, "status");
  const sort = value(params, "sort") || "relevance";
  const minScore = Number(value(params, "minScore") || 0);

  const [sources, items] = await Promise.all([
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    prisma.newsItem.findMany({
      where: {
        sourceId: sourceId || undefined,
        status: status && status !== "all" ? (status as NewsStatus) : undefined,
        overallScore: minScore ? { gte: minScore } : undefined
      },
      include: { source: true },
      orderBy:
        sort === "date"
          ? [{ createdAt: "desc" }]
          : sort === "novelty"
            ? [{ noveltyScore: "desc" }, { createdAt: "desc" }]
            : [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 120
    })
  ]);

  const filtered = query
    ? items.filter((item) =>
        [item.title, item.shortSummary, item.whyItMatters, ...asStringArray(item.tags), ...asStringArray(item.categories)]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : items;

  return (
    <>
      <MainNav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">Noticias de IA</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Busqueda, filtros y ordenacion sobre todas las noticias detectadas.
            </p>
          </div>
        </div>

        <form className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-soft md:grid-cols-6">
          <Input name="q" defaultValue={query} placeholder="Buscar" className="md:col-span-2" />
          <Select name="source" defaultValue={sourceId} aria-label="Fuente">
            <option value="">Todas las fuentes</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </Select>
          <Select name="status" defaultValue={status || "all"} aria-label="Estado">
            <option value="all">Todos los estados</option>
            <option value="REVIEW">Pendiente</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="SENT_TO_TELEGRAM">Telegram</option>
            <option value="DISCARDED">Descartado</option>
            <option value="ERROR">Error</option>
          </Select>
          <Select name="sort" defaultValue={sort} aria-label="Orden">
            <option value="relevance">Relevancia</option>
            <option value="date">Fecha</option>
            <option value="novelty">Novedad</option>
          </Select>
          <Input name="minScore" type="number" min="0" max="100" defaultValue={minScore || ""} placeholder="Score min." />
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        <section className="grid gap-4 lg:grid-cols-2">
          {filtered.length ? (
            filtered.map((item) => <NewsCard key={item.id} item={item} />)
          ) : (
            <div className="lg:col-span-2">
              <EmptyState title="Sin resultados" body="Prueba con otros filtros o ejecuta un nuevo analisis desde el panel de jobs." />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
