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

export function briefingWordBudget(targetDurationSeconds: number) {
  const durationSeconds = Math.max(120, Math.min(180, Math.round(targetDurationSeconds)));
  return {
    durationSeconds,
    minWords: Math.round(durationSeconds * 1.75),
    maxWords: Math.round(durationSeconds * 2.05)
  };
}

export class VideoScriptService {
  constructor(private readonly openaiService = new OpenAIService()) {}

  async generate(snapshots: NewsSnapshot[], targetDurationSeconds: number, language: string, signal?: AbortSignal) {
    const budget = briefingWordBudget(targetDurationSeconds);
    const sceneWords = Math.max(55, Math.floor((budget.minWords - 80) / Math.max(1, snapshots.length)));
    const prompt = `Crea el briefing audiovisual diario de IA para el equipo de Nuxton Knowledge Platform.

Objetivo editorial:
- En ${budget.durationSeconds} segundos, el equipo debe entender que ha cambiado, por que afecta a Nuxton y que accion merece la pena.
- No hagas un resumen cronologico del contenido original. Convierte la evidencia en decisiones.
- Si una novedad no cambia ninguna decision, dilo de forma breve y no la infles.

Reglas obligatorias:
- Devuelve exclusivamente JSON valido con version "1.0".
- Usa solo los snapshots proporcionados. No busques ni inventes informacion externa.
- Debe existir exactamente una escena por cada noticia y conservar su newsItemId.
- Mantiene nombres, fechas, cifras y limites. Si un dato no aparece, no lo completes.
- Espanol natural de Espana, frases cortas y tono de briefing ejecutivo.
- Sin saludos, definiciones basicas, historia del creador, sponsors, autopromocion, hype ni repeticiones.
- Empieza por el dato mas importante. No uses frases como "en este video", "vamos a ver" o "es interesante".
- El guion completo debe tener entre ${budget.minWords} y ${budget.maxWords} palabras.
- Introduccion: 20-35 palabras. Anticipa las decisiones, sin enumerar titulares.
- Cada escena: alrededor de ${sceneWords} palabras y una sola idea principal. Explica evidencia, impacto y siguiente paso.
- Cada escena debe tener exactamente tres onScreenBullets, breves y con estos prefijos: "Que cambio:", "Impacto Nuxton:" y "Accion:".
- Conclusion: 40-60 palabras. Prioriza, no recapitules.
- La conclusion debe tener exactamente tres onScreenBullets con estos prefijos: "Hacer hoy:", "Vigilar:" y "No priorizar:".
- La narracion aporta contexto util; el texto visible permite entender la decision sin audio.
- No leas URLs en voz alta.
- Ajusta el conjunto a unos ${budget.durationSeconds} segundos y nunca rellenes para alcanzar duracion.
- title maximo 140 caracteres; onScreenBullets maximo 3.
- sources debe incluir una entrada por noticia.

Idioma: ${language}

Forma JSON exacta:
{
  "version": "1.0",
  "title": "string",
  "subtitle": "string o null",
  "language": "${language}",
  "estimatedDurationSeconds": ${budget.durationSeconds},
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
    title: "Agentes mas seguros y modelos mas eficientes",
    subtitle: "Lo que cambia, el impacto para Nuxton y las decisiones del dia",
    language: "es-ES",
    estimatedDurationSeconds: 150,
    introduction: {
      narration: "Hoy hay dos senales utiles: los agentes ganan control operativo y los modelos compactos reducen coste. Estas son las decisiones que merece la pena tomar.",
      onScreenTitle: "Radar IA diario",
      onScreenText: "Dos senales. Dos decisiones. Sin ruido."
    },
    scenes: [
      {
        id: "scene-1",
        newsItemId: "demo-news-1",
        order: 1,
        title: "Los agentes ganan control operativo",
        narration: "Las nuevas herramientas de agentes incorporan mejores controles, trazabilidad y aprobaciones humanas. Para la empresa, el paso util es probar un flujo acotado y medir tiempo, calidad y excepciones.",
        onScreenBullets: ["Que cambio: mas control y trazabilidad", "Impacto Nuxton: menor riesgo operativo", "Accion: probar un flujo acotado"],
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
        onScreenBullets: ["Que cambio: mejor rendimiento compacto", "Impacto Nuxton: menor coste y latencia", "Accion: comparar por tarea"],
        sourceLabel: "Fuente de demostracion",
        sourceUrl: "https://example.com/demo-models",
        preferredImageUrl: null,
        estimatedDurationSeconds: 9
      }
    ],
    conclusion: {
      narration: "La recomendacion es priorizar un piloto de agentes y comparar un modelo compacto en una tarea repetitiva antes de ampliar el alcance.",
      onScreenTitle: "Que hacemos hoy",
      onScreenBullets: ["Hacer hoy: elegir un flujo piloto", "Vigilar: coste y excepciones", "No priorizar: demos sin metricas"]
    },
    sources: [
      { newsItemId: "demo-news-1", name: "Demo", title: "Agentes con control", url: "https://example.com/demo-agents" },
      { newsItemId: "demo-news-2", name: "Demo", title: "Modelos compactos", url: "https://example.com/demo-models" }
    ]
  });
}
