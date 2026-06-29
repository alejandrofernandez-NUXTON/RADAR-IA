import { NewsStatus, TrainingStatus } from "@prisma/client";
import { Filter, Send, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { MainNav } from "@/components/main-nav";
import { NewsCard } from "@/components/news-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { asStringArray } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function value(params: Record<string, string | string[] | undefined>, key: string) {
  const current = params[key];
  return Array.isArray(current) ? current[0] : current || "";
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const category = value(params, "category");
  const sourceId = value(params, "source");
  const relevance = Number(value(params, "relevance") || 0);

  const [sources, items, telegramSent, trainingCount] = await Promise.all([
    prisma.source.findMany({ orderBy: { name: "asc" } }),
    prisma.newsItem.findMany({
      where: {
        status: { in: [NewsStatus.PUBLISHED, NewsStatus.SENT_TO_TELEGRAM, NewsStatus.REVIEW] },
        sourceId: sourceId || undefined,
        overallScore: relevance ? { gte: relevance } : undefined
      },
      include: { source: true },
      orderBy: [{ featured: "desc" }, { overallScore: "desc" }, { createdAt: "desc" }],
      take: 60
    }),
    prisma.telegramMessage.count({ where: { status: "SENT" } }),
    prisma.trainingItem.count({ where: { status: { in: [TrainingStatus.PUBLISHED, TrainingStatus.FEATURED] } } })
  ]);

  const filtered = category
    ? items.filter((item) => asStringArray(item.categories).some((itemCategory) => itemCategory.toLowerCase() === category.toLowerCase()))
    : items;
  const categories = Array.from(new Set(items.flatMap((item) => asStringArray(item.categories)))).sort();
  const avgScore = filtered.length ? Math.round(filtered.reduce((total, item) => total + item.overallScore, 0) / filtered.length) : 0;

  return (
    <>
      <MainNav />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Radar interno</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">Novedades de IA priorizadas para actuar rapido</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Noticias recientes, senales accionables y recursos formativos gratuitos evaluados para uso empresarial.
            </p>
          </div>
          <form className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-soft sm:grid-cols-4 lg:w-[660px]">
            <Select name="category" defaultValue={category} aria-label="Categoria">
              <option value="">Todas las categorias</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select name="source" defaultValue={sourceId} aria-label="Fuente">
              <option value="">Todas las fuentes</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
            <Input name="relevance" type="number" min="0" max="100" defaultValue={relevance || ""} placeholder="Score min." />
            <Button variant="secondary" type="submit">
              Filtrar
            </Button>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric icon={TrendingUp} label="Noticias visibles" value={filtered.length} />
          <Metric icon={Sparkles} label="Score medio" value={avgScore} />
          <Metric icon={Send} label="Telegram enviadas" value={telegramSent} />
          <Metric icon={Filter} label="Formaciones publicadas" value={trainingCount} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {filtered.length ? (
            filtered.slice(0, 12).map((item) => <NewsCard key={item.id} item={item} />)
          ) : (
            <div className="lg:col-span-2">
              <EmptyState title="Todavia no hay noticias publicadas" body="Configura fuentes activas en el panel admin y ejecuta el job de analisis para empezar a llenar el radar." />
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" aria-hidden />
      </CardContent>
    </Card>
  );
}
