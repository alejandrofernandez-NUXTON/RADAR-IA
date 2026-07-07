import { z } from "zod";
import { SourceType } from "@prisma/client";
import { DEFAULT_TRAINING_ANALYSIS_PROMPT } from "@/lib/prompts";
import { SettingsService } from "@/lib/services/settings-service";
import type { SourceContent, TrainingCandidate } from "@/lib/types";
import { clampScore, truncate } from "@/lib/utils";
import {
  geminiNewsSchema,
  type GeminiNewsAnalysis,
  trainingEvaluationSchema,
  type TrainingEvaluation
} from "@/lib/validation";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiTextResult = {
  text: string;
  model: string;
  raw: unknown;
};

type GeminiInteractionResponse = {
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type ModelFailure = {
  model: string;
  status?: number;
  message: string;
};

const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash"
];

function normalizeModelName(model: string) {
  return model.trim().replace(/^models\//, "");
}

function modelCandidates(configuredModel: string) {
  return Array.from(new Set([normalizeModelName(configuredModel), ...GEMINI_MODEL_CANDIDATES].filter(Boolean)));
}

function modelPath(model: string) {
  return `models/${normalizeModelName(model)}`;
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: { message?: string; status?: string } };
    return payload.error?.message || payload.error?.status || text;
  } catch {
    return text;
  }
}

function summarizeModelFailures(context: string, failures: ModelFailure[]) {
  return `${context} fallo con todos los modelos probados: ${failures
    .map((failure) => `${failure.model}${failure.status ? ` (${failure.status})` : ""}: ${failure.message}`)
    .join(" | ")}`;
}

function extractJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

function parseOrThrow<T>(text: string, schema: z.ZodType<T>) {
  const json = JSON.parse(extractJson(text));
  return schema.parse(json);
}

function weightedOverall(input: Pick<GeminiNewsAnalysis, "relevanceScore" | "practicalityScore" | "noveltyScore" | "urgencyScore">) {
  return clampScore(input.relevanceScore * 0.3 + input.practicalityScore * 0.25 + input.noveltyScore * 0.25 + input.urgencyScore * 0.2);
}

function isYouTubeSourceType(type: SourceType) {
  return type === SourceType.YOUTUBE_VIDEO || type === SourceType.YOUTUBE_PLAYLIST || type === SourceType.YOUTUBE_CHANNEL;
}

export class GeminiService {
  async testConnection(modelOverride?: string) {
    const settings = await SettingsService.getAll();
    if (!settings.geminiApiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const models = modelOverride ? [normalizeModelName(modelOverride)] : modelCandidates(settings.geminiModel);
    const failures: ModelFailure[] = [];

    for (const model of models) {
      try {
        const response = await this.requestTextOnce(
          "Devuelve exactamente este JSON valido: {\"ok\":true}",
          model,
          settings.geminiApiKey,
          30_000,
          0
        );
        return { model, response: response.raw };
      } catch (error) {
        failures.push({ model, message: (error as Error).message });
      }
    }

    throw new Error(summarizeModelFailures("Gemini", failures));
  }

  private async requestTextOnce(prompt: string, model: string, apiKey: string, timeoutMs = 75_000, temperature = 0.2): Promise<GeminiTextResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/${modelPath(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature,
          responseMimeType: "application/json"
        }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
      throw new Error(`Gemini ${model} failed with ${response.status}: ${await readErrorMessage(response)}`);
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.flatMap((candidate) => candidate.content?.parts?.map((part) => part.text || "") || []).join("\n");
    if (!text) throw new Error("Gemini returned an empty response.");
    return { text, model, raw: payload };
  }

  private async requestText(prompt: string) {
    const settings = await SettingsService.getAll();
    if (!settings.geminiApiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const failures: ModelFailure[] = [];
    for (const model of modelCandidates(settings.geminiModel)) {
      try {
        return await this.requestTextOnce(prompt, model, settings.geminiApiKey);
      } catch (error) {
        failures.push({ model, message: (error as Error).message });
      }
    }

    throw new Error(summarizeModelFailures("Gemini text generation", failures));
  }

  private async requestJson<T>(prompt: string, schema: z.ZodType<T>) {
    const first = await this.requestText(prompt);
    try {
      return { parsed: parseOrThrow(first.text, schema), raw: { model: first.model, response: JSON.parse(extractJson(first.text)) as unknown } };
    } catch (firstError) {
      const repairPrompt = `Corrige el siguiente contenido para que sea JSON valido y respete exactamente el schema solicitado. Devuelve solo JSON.\n\n${first.text}`;
      const repaired = await this.requestText(repairPrompt);
      try {
        return {
          parsed: parseOrThrow(repaired.text, schema),
          raw: {
            model: first.model,
            repairModel: repaired.model,
            response: JSON.parse(extractJson(repaired.text)) as unknown
          }
        };
      } catch (repairError) {
        throw new Error(`Gemini JSON validation failed: ${(repairError as Error).message}. First error: ${(firstError as Error).message}`);
      }
    }
  }

  private extractInteractionText(payload: GeminiInteractionResponse) {
    if (payload.output_text) return payload.output_text;
    const text = payload.steps
      ?.flatMap((step) => step.content || [])
      .filter((content) => content.type === "text" || content.text)
      .map((content) => content.text || "")
      .join("\n");
    return text || "";
  }

  private async requestInteractionOnce(prompt: string, videoUrl: string, model: string, apiKey: string): Promise<GeminiTextResult> {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model: normalizeModelName(model),
        input: [
          { type: "video", uri: videoUrl },
          { type: "text", text: prompt }
        ]
      }),
      signal: AbortSignal.timeout(120_000)
    });

    if (!response.ok) {
      throw new Error(`Gemini Interactions ${model} failed with ${response.status}: ${await readErrorMessage(response)}`);
    }

    const payload = (await response.json()) as GeminiInteractionResponse;
    const text = this.extractInteractionText(payload);
    if (!text) throw new Error("Gemini Interactions returned an empty response.");
    return { text, model: normalizeModelName(model), raw: payload };
  }

  private async requestInteractionText(prompt: string, videoUrl: string) {
    const settings = await SettingsService.getAll();
    if (!settings.geminiApiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const failures: ModelFailure[] = [];
    for (const model of modelCandidates(settings.geminiModel)) {
      try {
        return await this.requestInteractionOnce(prompt, videoUrl, model, settings.geminiApiKey);
      } catch (error) {
        failures.push({ model, message: (error as Error).message });
      }
    }

    throw new Error(summarizeModelFailures("Gemini video analysis", failures));
  }

  private async requestInteractionJson<T>(prompt: string, videoUrl: string, schema: z.ZodType<T>) {
    const first = await this.requestInteractionText(prompt, videoUrl);
    try {
      return {
        parsed: parseOrThrow(first.text, schema),
        raw: { model: first.model, mode: "youtube_url", response: first.raw }
      };
    } catch (firstError) {
      const repaired = await this.requestText(`Corrige este contenido para que sea JSON valido. Devuelve solo JSON.\n\n${first.text}`);
      try {
        return {
          parsed: parseOrThrow(repaired.text, schema),
          raw: {
            model: first.model,
            repairModel: repaired.model,
            mode: "youtube_url",
            response: first.raw
          }
        };
      } catch (repairError) {
        throw new Error(`Gemini video JSON validation failed: ${(repairError as Error).message}. First error: ${(firstError as Error).message}`);
      }
    }
  }

  async analyzeNews(content: SourceContent) {
    const settings = await SettingsService.getAll();
    let videoModeError: string | null = null;
    const prompt = `${settings.basePrompt}

Idioma de salida: ${settings.outputLanguage}

Fuente:
- Nombre de fuente: ${content.source.name}
- Tipo: ${content.source.type}
- URL: ${content.sourceUrl}
- Autor/canal: ${content.author || "desconocido"}
- Fecha publicada: ${content.publishedAt?.toISOString() || "desconocida"}

Contenido disponible:
Titulo: ${content.title}

Descripcion:
${content.description || "No disponible"}

Transcript/subtitulos:
${content.transcript || "No disponible"}
`;

    try {
      if (
        isYouTubeSourceType(content.source.type) &&
        content.sourceUrl.includes("youtube.com/watch")
      ) {
        try {
          return await this.requestInteractionJson(prompt, content.sourceUrl, geminiNewsSchema);
        } catch (videoError) {
          videoModeError = (videoError as Error).message;
        }
      }

      const textResult = await this.requestJson(prompt, geminiNewsSchema);
      if (!videoModeError) return textResult;
      return {
        ...textResult,
        raw: {
          ...(typeof textResult.raw === "object" && textResult.raw ? textResult.raw : { response: textResult.raw }),
          mode: "text_fallback_after_youtube_url_failure",
          videoModeError
        }
      };
    } catch (error) {
      const fallback = this.fallbackNewsAnalysis(content);
      return {
        parsed: fallback,
        raw: {
          fallback: true,
          provider: "local",
          geminiConfigured: Boolean(settings.geminiApiKey),
          videoModeError,
          reason: (error as Error).message
        }
      };
    }
  }

  async evaluateTraining(candidate: TrainingCandidate) {
    const settings = await SettingsService.getAll();
    const prompt = `${DEFAULT_TRAINING_ANALYSIS_PROMPT}

Idioma de salida: ${settings.outputLanguage}

Recurso candidato:
${JSON.stringify(candidate, null, 2)}
`;

    try {
      return await this.requestJson(prompt, trainingEvaluationSchema);
    } catch (error) {
      const fallback = this.fallbackTrainingEvaluation(candidate);
      return {
        parsed: fallback,
        raw: {
          fallback: true,
          provider: "local",
          geminiConfigured: Boolean(settings.geminiApiKey),
          reason: (error as Error).message
        }
      };
    }
  }

  private fallbackNewsAnalysis(content: SourceContent): GeminiNewsAnalysis {
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
      longSummary: content.description || "No hay descripcion amplia disponible. Revisa la fuente original antes de publicar.",
      keyPoints: ["Analisis local generado porque Gemini no esta configurado.", "Revisar manualmente antes de publicar."],
      whyItMatters: "Puede contener aprendizajes o novedades de IA aplicables, pero requiere validacion humana.",
      businessApplications: ["Evaluar si la idea se puede convertir en piloto interno."],
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

  private fallbackTrainingEvaluation(candidate: TrainingCandidate): TrainingEvaluation {
    const qualityScore = candidate.provider.match(/google|microsoft|hugging face|deeplearning|github/i) ? 78 : 62;
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
