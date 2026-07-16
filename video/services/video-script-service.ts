import { OpenAIService } from "@/lib/services/openai-service";
import { VideoDigestError } from "@/video/errors";
import type { NewsSnapshot } from "@/video/schemas/news-snapshot-schema";
import { videoScriptSchema, type VideoScript } from "@/video/schemas/video-script-schema";

function assertScriptIntegrity(script: VideoScript, snapshots: NewsSnapshot[]) {
  const expected = snapshots.map((snapshot) => snapshot.newsItemId).sort();
  const received = script.scenes.map((scene) => scene.newsItemId).sort();
  if (JSON.stringify(expected) !== JSON.stringify(received)) {
    throw new VideoDigestError(
      "VIDEO_SCRIPT_VALIDATION_ERROR",
      "El guion no contiene exactamente las noticias reservadas."
    );
  }
  const duplicated = new Set<string>();
  for (const scene of script.scenes) {
    if (duplicated.has(scene.newsItemId)) {
      throw new VideoDigestError("VIDEO_SCRIPT_VALIDATION_ERROR", "El guion repite una noticia.");
    }
    duplicated.add(scene.newsItemId);
    assertHttpUrl(scene.sourceUrl, `sourceUrl de ${scene.id}`);
    assertHttpUrl(scene.preferredImageUrl, `preferredImageUrl de ${scene.id}`);
  }
  for (const source of script.sources) {
    assertHttpUrl(source.url, `url de la fuente ${source.newsItemId}`);
  }
}

function assertHttpUrl(value: string | null, label: string) {
  if (value === null) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsupported protocol");
  } catch {
    throw new VideoDigestError("VIDEO_SCRIPT_VALIDATION_ERROR", `${label} no contiene una URL HTTP valida.`);
  }
}

export class VideoScriptService {
  constructor(private readonly openaiService = new OpenAIService()) {}

  async generate(snapshots: NewsSnapshot[], targetDurationSeconds: number, language: string, signal?: AbortSignal) {
    const prompt = `Crea un guion audiovisual estructurado para un video explicativo interno de Nuxton Knowledge Platform.

Reglas obligatorias:
- Devuelve exclusivamente JSON valido con version "1.0".
- Usa solo los snapshots proporcionados. No busques ni inventes informacion externa.
- Debe existir exactamente una escena por cada noticia y conservar su newsItemId.
- Mantiene nombres, fechas y cifras. Si un dato no aparece, no lo completes.
- Espanol natural de Espana, tono profesional y orientado a decisiones empresariales.
- La narracion explica; el texto visible resume.
- Maximo tres puntos visuales por escena y ningun parrafo largo en pantalla.
- No leas URLs en voz alta.
- Sin sensacionalismo, promociones ni relleno.
- La introduccion debe anticipar el valor del lote y la conclusion debe proponer prioridades concretas.
- Ajusta el conjunto a unos ${targetDurationSeconds} segundos.
- title maximo 140 caracteres; onScreenBullets maximo 3.
- sources debe incluir una entrada por noticia.

Idioma: ${language}

Forma JSON exacta:
{
  "version": "1.0",
  "title": "string",
  "subtitle": "string o null",
  "language": "${language}",
  "estimatedDurationSeconds": 150,
  "introduction": {"narration":"string","onScreenTitle":"string","onScreenText":"string o null"},
  "scenes": [{"id":"scene-1","newsItemId":"id exacto","order":1,"title":"string","narration":"string","onScreenBullets":["string"],"sourceLabel":"string","sourceUrl":"https://... o null","preferredImageUrl":"https://... o null","estimatedDurationSeconds":25}],
  "conclusion": {"narration":"string","onScreenTitle":"string","onScreenBullets":["string"]},
  "sources": [{"newsItemId":"id exacto","name":"string","title":"string","url":"https://... o null"}]
}

Snapshots:
${JSON.stringify(snapshots, null, 2)}`;

    try {
      const result = await this.openaiService.generateStructuredJson(prompt, videoScriptSchema, signal);
      assertScriptIntegrity(result.parsed, snapshots);
      return result;
    } catch (error) {
      if (error instanceof VideoDigestError) throw error;
      throw new VideoDigestError(
        "VIDEO_SCRIPT_GENERATION_ERROR",
        `No se pudo generar un guion valido: ${error instanceof Error ? error.message : "error desconocido"}`,
        { cause: error }
      );
    }
  }
}

export function createDemoScript(): VideoScript {
  return videoScriptSchema.parse({
    version: "1.0",
    title: "Radar IA: decisiones que importan esta semana",
    subtitle: "Resumen ejecutivo de Nuxton Knowledge Platform",
    language: "es-ES",
    estimatedDurationSeconds: 28,
    introduction: {
      narration: "Estas son las novedades de inteligencia artificial que merece la pena revisar y convertir en acciones concretas.",
      onScreenTitle: "Radar IA de Nuxton",
      onScreenText: "Tres senales para priorizar esta semana"
    },
    scenes: [
      {
        id: "scene-1",
        newsItemId: "demo-news-1",
        order: 1,
        title: "Los agentes ganan control operativo",
        narration: "Las nuevas herramientas de agentes incorporan mejores controles, trazabilidad y aprobaciones humanas. Para la empresa, el paso util es probar un flujo acotado y medir tiempo, calidad y excepciones.",
        onScreenBullets: ["Mas control y trazabilidad", "Piloto en un proceso acotado", "Medir excepciones y calidad"],
        sourceLabel: "Fuente de demostracion",
        sourceUrl: "https://example.com/demo-agents",
        preferredImageUrl: null,
        estimatedDurationSeconds: 10
      },
      {
        id: "scene-2",
        newsItemId: "demo-news-2",
        order: 2,
        title: "Modelos mas pequenos, despliegues mas simples",
        narration: "Los modelos compactos siguen mejorando en tareas empresariales concretas. Esto abre una via para reducir coste y latencia sin usar siempre el modelo mas grande.",
        onScreenBullets: ["Menor coste por tarea", "Menos latencia", "Evaluacion por caso de uso"],
        sourceLabel: "Fuente de demostracion",
        sourceUrl: "https://example.com/demo-models",
        preferredImageUrl: null,
        estimatedDurationSeconds: 9
      }
    ],
    conclusion: {
      narration: "La recomendacion es priorizar un piloto de agentes y comparar un modelo compacto en una tarea repetitiva antes de ampliar el alcance.",
      onScreenTitle: "Siguiente paso",
      onScreenBullets: ["Elegir un flujo", "Definir metricas", "Revisar resultados en dos semanas"]
    },
    sources: [
      { newsItemId: "demo-news-1", name: "Demo", title: "Agentes con control", url: "https://example.com/demo-agents" },
      { newsItemId: "demo-news-2", name: "Demo", title: "Modelos compactos", url: "https://example.com/demo-models" }
    ]
  });
}
