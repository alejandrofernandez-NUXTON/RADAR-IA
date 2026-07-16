import { createReadStream } from "fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { SourceType } from "@prisma/client";
import type { z } from "zod";
import { DEFAULT_TRAINING_ANALYSIS_PROMPT } from "@/lib/prompts";
import { SettingsService } from "@/lib/services/settings-service";
import { YouTubeMediaService, hasUsefulYouTubeTranscript } from "@/lib/services/youtube-media-service";
import type { SourceContent, TrainingCandidate } from "@/lib/types";
import { clampScore, truncate } from "@/lib/utils";
import {
  newsAnalysisSchema,
  type NewsAnalysis,
  trainingEvaluationSchema,
  type TrainingEvaluation
} from "@/lib/validation";

type StructuredRequestOptions = {
  signal?: AbortSignal;
  imageUrls?: string[];
  schemaName?: string;
};

function requestSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (signal.aborted) return signal;
  return AbortSignal.any([timeout, signal]);
}

function cancellationError(signal?: AbortSignal) {
  if (!signal?.aborted) return null;
  return new Error(typeof signal.reason === "string" ? signal.reason : "Proceso detenido manualmente.");
}

function isVisualEvidenceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /image|imagen|image_url|fetch.*url|download.*url|unsupported.*format/i.test(message);
}

function isYouTubeSourceType(type: SourceType) {
  return type === SourceType.YOUTUBE_VIDEO || type === SourceType.YOUTUBE_PLAYLIST || type === SourceType.YOUTUBE_CHANNEL;
}

function isYouTubeWatchUrl(url: string) {
  return url.includes("youtube.com/watch") || url.includes("youtu.be/");
}

function weightedOverall(input: Pick<NewsAnalysis, "relevanceScore" | "practicalityScore" | "noveltyScore" | "urgencyScore">) {
  return clampScore(input.relevanceScore * 0.3 + input.practicalityScore * 0.25 + input.noveltyScore * 0.25 + input.urgencyScore * 0.2);
}

function responseSummary(response: {
  id: string;
  model: string;
  usage?: unknown;
  output?: unknown;
  status?: string;
}) {
  return {
    provider: "openai",
    responseId: response.id,
    model: response.model,
    status: response.status,
    usage: response.usage,
    output: response.output
  };
}

export class OpenAIService {
  private readonly youtubeMedia = new YouTubeMediaService();

  private async getConfiguredClient() {
    const settings = await SettingsService.getAll();
    if (!settings.openaiEnabled) throw new Error("El motor OpenAI esta desactivado en Ajustes.");
    if (!settings.openaiApiKey) throw new Error("OpenAI API key is not configured.");
    return {
      settings,
      client: new OpenAI({ apiKey: settings.openaiApiKey, maxRetries: 2, timeout: 180_000 })
    };
  }

  async testConnection(modelOverride?: string) {
    const { client, settings } = await this.getConfiguredClient();
    const model = modelOverride?.trim() || settings.openaiModel;
    const response = await client.responses.create(
      {
        model,
        input: "Responde unicamente con la palabra OK.",
        reasoning: { effort: "none" },
        max_output_tokens: 16
      },
      { timeout: 60_000 }
    );
    if (!response.output_text.trim()) throw new Error("OpenAI devolvio una respuesta vacia.");
    return { model: response.model, responseId: response.id };
  }

  async generateStructuredJson<T>(prompt: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return this.requestStructuredJson(prompt, schema, { signal, schemaName: "nuxton_structured_output" });
  }

  private async requestStructuredJson<T>(prompt: string, schema: z.ZodType<T>, options: StructuredRequestOptions = {}) {
    const { client, settings } = await this.getConfiguredClient();
    const imageUrls = [...new Set(options.imageUrls || [])].slice(0, 4);
    const request = async (images: string[]) => {
      const content: ResponseInputContent[] = [
        { type: "input_text", text: prompt },
        ...images.map((imageUrl): ResponseInputContent => ({
          type: "input_image",
          detail: "low",
          image_url: imageUrl
        }))
      ];
      const response = await client.responses.parse(
        {
          model: settings.openaiModel,
          input: [{ role: "user", content }],
          reasoning: { effort: settings.openaiReasoningEffort },
          text: {
            format: zodTextFormat(schema, options.schemaName || "nuxton_output")
          }
        },
        { signal: requestSignal(180_000, options.signal) }
      );
      if (!response.output_parsed) throw new Error("OpenAI no devolvio una salida estructurada valida.");
      return {
        parsed: response.output_parsed as T,
        raw: {
          ...responseSummary(response),
          visualEvidenceCount: images.length
        }
      };
    };

    try {
      return await request(imageUrls);
    } catch (error) {
      const cancelled = cancellationError(options.signal);
      if (cancelled) throw cancelled;
      if (!imageUrls.length || !isVisualEvidenceError(error)) throw error;
      const fallback = await request([]);
      return {
        ...fallback,
        raw: {
          ...fallback.raw,
          visualEvidenceFallback: true,
          visualEvidenceError: error instanceof Error ? truncate(error.message, 800) : "Error cargando evidencia visual."
        }
      };
    }
  }

  async transcribeAudio(filePath: string, language: string, signal?: AbortSignal) {
    const { client, settings } = await this.getConfiguredClient();
    const response = await client.audio.transcriptions.create(
      {
        file: createReadStream(filePath),
        model: settings.openaiTranscriptionModel,
        language: language.split("-")[0],
        response_format: "json",
        prompt: "Transcripcion fiel. Conserva nombres propios, modelos, empresas, cifras y terminologia tecnica."
      },
      { signal: requestSignal(180_000, signal) }
    );
    const text = response.text?.replace(/\s+/g, " ").trim();
    if (!text) throw new Error("OpenAI no devolvio una transcripcion util del audio.");
    return { text, model: settings.openaiTranscriptionModel };
  }

  private buildNewsPrompt(content: SourceContent, outputLanguage: string, transcript: string, hasVisualEvidence: boolean) {
    return `Analiza el contenido real de esta publicacion para crear una ficha ejecutiva de inteligencia artificial.

Evidencia disponible:
- La transcripcion procede de subtitulos de YouTube o de transcripcion del audio con OpenAI.
- ${hasVisualEvidence ? "Se adjuntan storyboards y miniatura del video como evidencia visual complementaria." : "No hay evidencia visual util; no infieras lo que aparece en pantalla."}
- La descripcion solo sirve como metadato. No la uses como sustituto del contenido real.

Reglas editoriales:
- Sintetiza solo novedades concretas, verificables y utiles para una empresa.
- Ignora sponsors, promociones, llamadas a comunidades, newsletters, descuentos, sorteos y relleno.
- Si aparecen varias noticias, prioriza entre tres y seis aportaciones con impacto real.
- Conserva nombres de modelos, productos, companias, fechas y cifras cuando existan en la evidencia.
- shortSummary debe tener dos o tres frases ejecutivas y explicar que ha ocurrido.
- longSummary debe explicar el contenido con suficiente detalle para actuar sin ver el video completo.
- whyItMatters debe describir impacto empresarial, no entusiasmo generico.
- businessApplications debe proponer acciones concretas, areas responsables o pilotos.
- No inventes informacion externa ni completes datos ausentes.
- Si la evidencia es pobre o el contenido no aporta novedad, recomienda discard y reduce las puntuaciones.
- Devuelve todos los campos solicitados por el schema, sin texto fuera de la salida estructurada.

Idioma de salida: ${outputLanguage}

Fuente:
- Nombre: ${content.source.name}
- Tipo: ${content.source.type}
- URL: ${content.sourceUrl}
- Autor/canal: ${content.author || "desconocido"}
- Fecha: ${content.publishedAt?.toISOString() || "desconocida"}
- Titulo original: ${content.title}

Transcripcion:
${transcript.slice(0, 260_000)}`;
  }

  async analyzeNews(content: SourceContent, signal?: AbortSignal) {
    const settings = await SettingsService.getAll();
    let videoEvidenceError: string | null = null;

    try {
      if (isYouTubeSourceType(content.source.type) && isYouTubeWatchUrl(content.sourceUrl)) {
        const evidence = await this.youtubeMedia.collectEvidence(content.sourceUrl, content.transcript, content.source.language);
        let transcript = evidence.transcript;
        let transcriptSource = evidence.transcriptSource;

        if (!hasUsefulYouTubeTranscript(transcript)) {
          let audio: Awaited<ReturnType<YouTubeMediaService["downloadAudio"]>> | null = null;
          try {
            audio = await this.youtubeMedia.downloadAudio(content.sourceUrl, signal);
            const transcription = await this.transcribeAudio(audio.filePath, content.source.language, signal);
            transcript = transcription.text;
            transcriptSource = "openai_transcription";
          } catch (error) {
            videoEvidenceError = error instanceof Error ? error.message : "No se pudo transcribir el audio de YouTube.";
          } finally {
            await audio?.cleanup().catch(() => undefined);
          }
        }

        if (!hasUsefulYouTubeTranscript(transcript)) {
          const fallback = this.fallbackUnavailableVideoAnalysis(content, videoEvidenceError);
          return {
            parsed: fallback,
            raw: {
              fallback: true,
              provider: "local",
              analysisUnavailable: true,
              requiresVideoAnalysis: true,
              openaiConfigured: Boolean(settings.openaiApiKey),
              videoEvidenceError,
              reason: "No hay transcript suficiente y OpenAI no pudo transcribir el audio del video."
            }
          };
        }

        content.transcript = transcript;
        content.rawMetadata = {
          ...content.rawMetadata,
          transcriptSource,
          transcriptLength: transcript.length,
          storyboardCount: evidence.imageUrls.length
        };
        const imageUrls = settings.openaiVisionEnabled ? evidence.imageUrls : [];
        const result = await this.requestStructuredJson(
          `${settings.basePrompt}\n\n${this.buildNewsPrompt(content, settings.outputLanguage, transcript, imageUrls.length > 0)}`,
          newsAnalysisSchema,
          { signal, imageUrls, schemaName: "news_analysis" }
        );
        return {
          ...result,
          raw: {
            ...result.raw,
            mode: transcriptSource,
            videoId: evidence.videoId,
            transcriptLength: transcript.length,
            storyboardCount: imageUrls.length,
            videoEvidenceError
          }
        };
      }

      const prompt = `${settings.basePrompt}

Analiza la siguiente publicacion usando solo el contenido proporcionado. Devuelve una ficha ejecutiva completa y estructurada, sin inventar datos.

Idioma de salida: ${settings.outputLanguage}
Fuente: ${content.source.name}
Tipo: ${content.source.type}
URL: ${content.sourceUrl}
Autor: ${content.author || "desconocido"}
Fecha: ${content.publishedAt?.toISOString() || "desconocida"}
Titulo: ${content.title}
Descripcion o contenido:
${content.description || content.transcript || "No disponible"}`;
      return await this.requestStructuredJson(prompt, newsAnalysisSchema, { signal, schemaName: "news_analysis" });
    } catch (error) {
      const cancelled = cancellationError(signal);
      if (cancelled) throw cancelled;
      const fallback = this.fallbackNewsAnalysis(content);
      return {
        parsed: fallback,
        raw: {
          fallback: true,
          provider: "local",
          openaiConfigured: Boolean(settings.openaiApiKey),
          videoEvidenceError,
          reason: error instanceof Error ? error.message : "Fallo desconocido de OpenAI."
        }
      };
    }
  }

  async evaluateTraining(candidate: TrainingCandidate, signal?: AbortSignal) {
    const settings = await SettingsService.getAll();
    const prompt = `${DEFAULT_TRAINING_ANALYSIS_PROMPT}

Idioma de salida: ${settings.outputLanguage}

Recurso candidato:
${JSON.stringify(candidate, null, 2)}`;
    try {
      return await this.requestStructuredJson(prompt, trainingEvaluationSchema, { signal, schemaName: "training_evaluation" });
    } catch (error) {
      const cancelled = cancellationError(signal);
      if (cancelled) throw cancelled;
      return {
        parsed: this.fallbackTrainingEvaluation(candidate),
        raw: {
          fallback: true,
          provider: "local",
          openaiConfigured: Boolean(settings.openaiApiKey),
          reason: error instanceof Error ? error.message : "Fallo desconocido de OpenAI."
        }
      };
    }
  }

  private fallbackNewsAnalysis(content: SourceContent): NewsAnalysis {
    const text = `${content.title} ${content.description || ""}`.toLowerCase();
    const practicalKeywords = ["agent", "workflow", "api", "automation", "tool", "tutorial", "case study", "demo"];
    const noveltyKeywords = ["new", "launch", "released", "announce", "benchmark", "model", "open source"];
    const practicalityScore = clampScore(55 + practicalKeywords.filter((keyword) => text.includes(keyword)).length * 8);
    const noveltyScore = clampScore(50 + noveltyKeywords.filter((keyword) => text.includes(keyword)).length * 8);
    const relevanceScore = clampScore(text.includes("ai") || text.includes("llm") || text.includes("agent") ? 72 : 50);
    const urgencyScore = clampScore(noveltyScore > 70 ? 70 : 45);
    const overallScore = weightedOverall({ relevanceScore, practicalityScore, noveltyScore, urgencyScore });

    return {
      title: content.title,
      shortSummary: truncate(content.description || "Contenido detectado para revision interna.", 240),
      longSummary: content.description || "No hay contenido suficiente. Revisa la fuente original antes de publicar.",
      keyPoints: ["Analisis local porque OpenAI no esta operativo.", "Revisar manualmente antes de publicar."],
      whyItMatters: "Puede contener aprendizajes de IA, pero requiere validacion humana.",
      businessApplications: ["Evaluar si la idea se puede convertir en un piloto interno."],
      toolsMentioned: [],
      companiesMentioned: [],
      categories: [content.source.category],
      tags: ["ia", "revision"],
      noveltyScore,
      relevanceScore,
      practicalityScore,
      urgencyScore,
      overallScore,
      recommendedAction: "review",
      telegramWorthy: false,
      telegramMessage: "",
      sourceReliability: "medium",
      detectedLanguage: content.source.language
    };
  }

  private fallbackUnavailableVideoAnalysis(content: SourceContent, reason: string | null): NewsAnalysis {
    return {
      title: content.title,
      shortSummary: "Analisis pendiente: OpenAI no ha podido obtener una transcripcion fiable del video de YouTube.",
      longSummary: [
        "No se ha generado un resumen editorial porque la aplicacion no ha podido leer el contenido real del video.",
        "La descripcion de YouTube no se ha usado como sustituto para evitar contenido promocional o incompleto.",
        reason ? `Motivo tecnico: ${truncate(reason, 800)}` : "Motivo tecnico: no disponible."
      ].join("\n\n"),
      keyPoints: [
        "Pendiente de reanalizar cuando OpenAI pueda transcribir el audio.",
        "No publicar ni enviar a Telegram hasta analizar el contenido real."
      ],
      whyItMatters: "Sin transcript o audio no se puede valorar de forma fiable la relevancia empresarial.",
      businessApplications: ["Reprocesar con OpenAI operativo o revisar manualmente el video."],
      toolsMentioned: [],
      companiesMentioned: [],
      categories: [content.source.category],
      tags: ["pendiente-analisis-video", "youtube"],
      noveltyScore: 0,
      relevanceScore: 0,
      practicalityScore: 0,
      urgencyScore: 0,
      overallScore: 0,
      recommendedAction: "review",
      telegramWorthy: false,
      telegramMessage: "",
      sourceReliability: "low",
      detectedLanguage: content.source.language
    };
  }

  private fallbackTrainingEvaluation(candidate: TrainingCandidate): TrainingEvaluation {
    const qualityScore = candidate.provider.match(/openai|google|microsoft|hugging face|deeplearning|github/i) ? 78 : 62;
    const practicalityScore = candidate.contentType === "documentation" || candidate.contentType === "tutorial" ? 78 : 68;
    const freshnessScore = candidate.publishedAt && candidate.publishedAt > new Date(Date.now() - 1000 * 60 * 60 * 24 * 365) ? 80 : 62;
    const overallScore = clampScore(qualityScore * 0.35 + practicalityScore * 0.4 + freshnessScore * 0.25);
    return {
      title: candidate.title,
      description: candidate.description,
      url: candidate.url,
      provider: candidate.provider,
      contentType: candidate.contentType,
      estimatedDuration: candidate.estimatedDuration || "Variable",
      level: candidate.level || "beginner",
      topics: candidate.topics || ["IA aplicada"],
      qualityScore,
      practicalityScore,
      freshnessScore,
      overallScore,
      whyRecommended: "Recurso de una fuente reputada o con utilidad practica para aprendizaje interno.",
      isFree: candidate.isFree ?? true,
      language: candidate.language || "en"
    };
  }
}
