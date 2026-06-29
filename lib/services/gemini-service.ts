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

    const model = modelOverride || settings.geminiModel;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "Devuelve exactamente este JSON valido: {\"ok\":true}" }]
          }
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json"
        }
      }),
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();

    if (!response.ok) {
      let message = text;
      try {
        const payload = JSON.parse(text) as { error?: { message?: string; status?: string } };
        message = payload.error?.message || payload.error?.status || text;
      } catch {
        message = text;
      }
      throw new Error(`Gemini ${model} failed with ${response.status}: ${message}`);
    }

    return { model, response: text };
  }

  private async requestText(prompt: string) {
    const settings = await SettingsService.getAll();
    if (!settings.geminiApiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      settings.geminiModel
    )}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`;

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
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      }),
      signal: AbortSignal.timeout(75_000)
    });

    const payload = (await response.json()) as GeminiResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Gemini request failed with status ${response.status}`);
    }

    const text = payload.candidates?.flatMap((candidate) => candidate.content?.parts?.map((part) => part.text || "") || []).join("\n");
    if (!text) throw new Error("Gemini returned an empty response.");
    return text;
  }

  private async requestJson<T>(prompt: string, schema: z.ZodType<T>) {
    const first = await this.requestText(prompt);
    try {
      return { parsed: parseOrThrow(first, schema), raw: JSON.parse(extractJson(first)) as unknown };
    } catch (firstError) {
      const repairPrompt = `Corrige el siguiente contenido para que sea JSON valido y respete exactamente el schema solicitado. Devuelve solo JSON.\n\n${first}`;
      const repaired = await this.requestText(repairPrompt);
      try {
        return { parsed: parseOrThrow(repaired, schema), raw: JSON.parse(extractJson(repaired)) as unknown };
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

  private async requestInteractionJson<T>(prompt: string, videoUrl: string, schema: z.ZodType<T>) {
    const settings = await SettingsService.getAll();
    if (!settings.geminiApiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.geminiApiKey
      },
      body: JSON.stringify({
        model: settings.geminiModel,
        input: [
          { type: "text", text: prompt },
          { type: "video", uri: videoUrl }
        ]
      }),
      signal: AbortSignal.timeout(120_000)
    });

    const payload = (await response.json()) as GeminiInteractionResponse & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `Gemini Interactions request failed with status ${response.status}`);
    }

    const text = this.extractInteractionText(payload);
    if (!text) throw new Error("Gemini Interactions returned an empty response.");

    try {
      return { parsed: parseOrThrow(text, schema), raw: payload as unknown };
    } catch (firstError) {
      const repaired = await this.requestText(`Corrige este contenido para que sea JSON valido. Devuelve solo JSON.\n\n${text}`);
      try {
        return { parsed: parseOrThrow(repaired, schema), raw: payload as unknown };
      } catch (repairError) {
        throw new Error(`Gemini video JSON validation failed: ${(repairError as Error).message}. First error: ${(firstError as Error).message}`);
      }
    }
  }

  async analyzeNews(content: SourceContent) {
    const settings = await SettingsService.getAll();
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
          void videoError;
        }
      }

      return await this.requestJson(prompt, geminiNewsSchema);
    } catch (error) {
      if (settings.geminiApiKey) throw error;
      const fallback = this.fallbackNewsAnalysis(content);
      return { parsed: fallback, raw: { fallback: true, reason: (error as Error).message } };
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
      if (settings.geminiApiKey) throw error;
      const fallback = this.fallbackTrainingEvaluation(candidate);
      return { parsed: fallback, raw: { fallback: true, reason: (error as Error).message } };
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
      recommendedAction: overallScore >= 70 ? "review" : "discard",
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
