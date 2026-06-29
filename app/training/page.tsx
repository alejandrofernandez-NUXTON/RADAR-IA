import { TrainingStatus } from "@prisma/client";
import { MainNav } from "@/components/main-nav";
import { TrainingCard } from "@/components/training-card";
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

export default async function TrainingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = value(params, "q").toLowerCase();
  const level = value(params, "level");
  const type = value(params, "type");

  const items = await prisma.trainingItem.findMany({
    where: {
      status: { in: [TrainingStatus.PUBLISHED, TrainingStatus.FEATURED] },
      level: level || undefined,
      contentType: type || undefined
    },
    orderBy: [{ status: "asc" }, { overallScore: "desc" }, { updatedAt: "desc" }],
    take: 80
  });

  const filtered = query
    ? items.filter((item) =>
        [item.title, item.description, item.whyRecommended, item.provider, ...asStringArray(item.topics)].join(" ").toLowerCase().includes(query)
      )
    : items;

  return (
    <>
      <MainNav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-normal">Formaciones gratuitas de IA</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Cursos, tutoriales, documentacion y recursos breves evaluados automaticamente por utilidad practica.
          </p>
        </div>

        <form className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-soft md:grid-cols-5">
          <Input name="q" defaultValue={query} placeholder="Buscar formacion" className="md:col-span-2" />
          <Select name="level" defaultValue={level} aria-label="Nivel">
            <option value="">Todos los niveles</option>
            <option value="beginner">Principiante</option>
            <option value="intermediate">Intermedio</option>
            <option value="advanced">Avanzado</option>
          </Select>
          <Select name="type" defaultValue={type} aria-label="Tipo">
            <option value="">Todos los tipos</option>
            <option value="video">Video</option>
            <option value="course">Curso</option>
            <option value="tutorial">Tutorial</option>
            <option value="playlist">Playlist</option>
            <option value="article">Articulo practico</option>
            <option value="documentation">Documentacion</option>
          </Select>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>

        <section className="grid gap-4 lg:grid-cols-2">
          {filtered.length ? (
            filtered.map((item) => <TrainingCard key={item.id} item={item} />)
          ) : (
            <div className="lg:col-span-2">
              <EmptyState title="Todavia no hay formaciones publicadas" body="Ejecuta el job de busqueda de formaciones desde el panel admin para evaluar recursos gratuitos." />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
