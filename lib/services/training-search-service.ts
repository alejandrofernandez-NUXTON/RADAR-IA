import { TrainingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OpenAIService } from "@/lib/services/openai-service";
import { LogService } from "@/lib/services/log-service";
import type { JobProgressReporter, JobResult, TrainingCandidate } from "@/lib/types";

export interface TrainingSearchProvider {
  name: string;
  search(limit: number): Promise<TrainingCandidate[]>;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageMetadata(candidate: TrainingCandidate): Promise<TrainingCandidate> {
  try {
    const response = await fetch(candidate.url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) return candidate;
    const html = await response.text();
    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1];

    return {
      ...candidate,
      title: title ? decodeHtml(title) : candidate.title,
      description: description ? decodeHtml(description) : candidate.description
    };
  } catch {
    return candidate;
  }
}

class ReputableCatalogProvider implements TrainingSearchProvider {
  name = "reputable-catalog";

  async search(limit: number) {
    const candidates: TrainingCandidate[] = [
      {
        title: "Hugging Face Course",
        description: "Curso gratuito sobre transformers, NLP, modelos y uso practico del ecosistema Hugging Face.",
        url: "https://huggingface.co/learn",
        provider: "Hugging Face",
        contentType: "course",
        estimatedDuration: "Variable",
        level: "intermediate",
        topics: ["LLMs", "open source", "transformers"],
        language: "en",
        isFree: true
      },
      {
        title: "Microsoft Learn AI",
        description: "Rutas gratuitas de aprendizaje de Microsoft sobre IA, Azure AI y copilots.",
        url: "https://learn.microsoft.com/training/ai/",
        provider: "Microsoft Learn",
        contentType: "course",
        estimatedDuration: "Variable",
        level: "beginner",
        topics: ["IA empresarial", "Azure AI", "copilots"],
        language: "en",
        isFree: true
      },
      {
        title: "Google AI for Developers",
        description: "Documentacion y guias gratuitas para Gemini API, modelos y desarrollo con IA.",
        url: "https://ai.google.dev/",
        provider: "Google AI",
        contentType: "documentation",
        estimatedDuration: "Variable",
        level: "intermediate",
        topics: ["Gemini", "APIs", "desarrollo"],
        language: "en",
        isFree: true
      },
      {
        title: "DeepLearning.AI Short Courses",
        description: "Cursos breves gratuitos sobre GenAI, agentes, RAG, prompting y herramientas modernas.",
        url: "https://www.deeplearning.ai/short-courses/",
        provider: "DeepLearning.AI",
        contentType: "course",
        estimatedDuration: "1-2 horas por curso",
        level: "intermediate",
        topics: ["GenAI", "RAG", "agentes", "prompting"],
        language: "en",
        isFree: true
      },
      {
        title: "GitHub Skills: GitHub Copilot",
        description: "Formacion practica gratuita para trabajar con GitHub Copilot en flujos de desarrollo.",
        url: "https://skills.github.com/",
        provider: "GitHub Skills",
        contentType: "tutorial",
        estimatedDuration: "Menos de 1 hora",
        level: "beginner",
        topics: ["Copilot", "desarrollo", "productividad"],
        language: "en",
        isFree: true
      }
    ];

    return Promise.all(candidates.slice(0, limit).map(fetchPageMetadata));
  }
}

class FeedTrainingProvider implements TrainingSearchProvider {
  name = "public-feeds";

  private feeds = [
    {
      provider: "Hugging Face Blog",
      url: "https://huggingface.co/blog/feed.xml",
      topics: ["open source", "modelos", "LLMs"]
    },
    {
      provider: "Microsoft AI Blog",
      url: "https://blogs.microsoft.com/ai/feed/",
      topics: ["IA empresarial", "copilots", "productividad"]
    }
  ];

  async search(limit: number) {
    const results: TrainingCandidate[] = [];

    for (const feed of this.feeds) {
      try {
        const response = await fetch(feed.url, { signal: AbortSignal.timeout(25_000) });
        if (!response.ok) continue;
        const xml = await response.text();
        const items = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, Math.ceil(limit / this.feeds.length));

        for (const [, , item] of items) {
          const title = decodeHtml(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") || feed.provider);
          const link =
            item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.replace(/<[^>]+>/g, " ").trim() ||
            item.match(/<link[^>]+href="([^"]+)"/i)?.[1] ||
            feed.url;
          const description = decodeHtml(
            item.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1]?.replace(/<[^>]+>/g, " ") ||
              item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1]?.replace(/<[^>]+>/g, " ") ||
              "Recurso publico relacionado con IA."
          );
          const publishedRaw =
            item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ||
            item.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ||
            item.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1];

          results.push({
            title,
            description,
            url: decodeHtml(link),
            provider: feed.provider,
            contentType: "article",
            estimatedDuration: "10-20 min",
            level: "intermediate",
            topics: feed.topics,
            language: "en",
            isFree: true,
            publishedAt: publishedRaw ? new Date(decodeHtml(publishedRaw)) : undefined
          });
        }
      } catch (error) {
        await LogService.warn("training.provider", `No se pudo consultar ${feed.provider}`, { error: (error as Error).message });
      }
    }

    return results.slice(0, limit);
  }
}

export class TrainingSearchService {
  private openaiService = new OpenAIService();
  private providers: TrainingSearchProvider[] = [new ReputableCatalogProvider(), new FeedTrainingProvider()];

  async runSearch(limit = 24, progress?: JobProgressReporter): Promise<JobResult> {
    const candidates: TrainingCandidate[] = [];

    await progress?.({ percent: 5, message: `Consultando ${this.providers.length} proveedor(es) de formacion...`, totalCount: this.providers.length });

    for (const [providerIndex, provider] of this.providers.entries()) {
      try {
        progress?.throwIfCancelled?.();
        await progress?.({
          percent: 8 + Math.round((providerIndex / this.providers.length) * 28),
          message: `Buscando recursos en ${provider.name}...`,
          totalCount: this.providers.length
        });
        const results = await provider.search(Math.ceil(limit / this.providers.length));
        candidates.push(...results);
      } catch (error) {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        await LogService.error("training.provider", `Error buscando formaciones en ${provider.name}`, {
          error: (error as Error).message
        });
      }
    }

    const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.url, candidate])).values()).slice(0, limit);
    let successCount = 0;
    let failedCount = 0;

    if (!uniqueCandidates.length) {
      await progress?.({ percent: 100, message: "No se encontraron formaciones nuevas.", processedCount: 0, successCount: 0, failedCount: 0 });
      return {
        processedCount: 0,
        successCount,
        failedCount,
        metadata: { providers: this.providers.map((provider) => provider.name) }
      };
    }

    await progress?.({
      percent: 38,
      message: `Evaluando ${uniqueCandidates.length} recurso(s) candidato(s)...`,
      processedCount: 0,
      totalCount: uniqueCandidates.length,
      successCount,
      failedCount
    });

    for (const [candidateIndex, candidate] of uniqueCandidates.entries()) {
      progress?.throwIfCancelled?.();
      const existing = await prisma.trainingItem.findUnique({ where: { url: candidate.url } });
      const processedCount = candidateIndex + 1;
      const percent = 40 + Math.round((processedCount / uniqueCandidates.length) * 54);
      if (existing) {
        await progress?.({
          percent,
          message: `Ya existia: ${candidate.title}`,
          processedCount,
          totalCount: uniqueCandidates.length,
          successCount,
          failedCount
        });
        continue;
      }

      try {
        await progress?.({
          percent: Math.max(40, percent - 2),
          message: `Evaluando ${processedCount}/${uniqueCandidates.length}: ${candidate.title}`,
          processedCount,
          totalCount: uniqueCandidates.length,
          successCount,
          failedCount
        });
        const { parsed, raw } = await this.openaiService.evaluateTraining(candidate, progress?.signal);
        await prisma.trainingItem.create({
          data: {
            title: parsed.title,
            description: parsed.description,
            url: parsed.url,
            provider: parsed.provider,
            contentType: parsed.contentType,
            estimatedDuration: parsed.estimatedDuration,
            level: parsed.level,
            topics: parsed.topics,
            qualityScore: parsed.qualityScore,
            practicalityScore: parsed.practicalityScore,
            freshnessScore: parsed.freshnessScore,
            overallScore: parsed.overallScore,
            whyRecommended: parsed.whyRecommended,
            isFree: parsed.isFree,
            language: parsed.language,
            status: parsed.isFree && parsed.overallScore >= 74 ? TrainingStatus.PUBLISHED : TrainingStatus.REVIEW,
            rawEvaluation: raw as Prisma.InputJsonValue
          }
        });
        successCount += 1;
        await progress?.({
          percent,
          message: `Guardada formacion: ${parsed.title}`,
          processedCount,
          totalCount: uniqueCandidates.length,
          successCount,
          failedCount
        });
      } catch (error) {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        failedCount += 1;
        await LogService.error("training.analysis", "No se pudo evaluar una formacion", {
          url: candidate.url,
          error: (error as Error).message
        });
        await progress?.({
          percent,
          message: `Error evaluando ${candidate.title}`,
          processedCount,
          totalCount: uniqueCandidates.length,
          successCount,
          failedCount
        });
      }
    }

    await progress?.({
      percent: 96,
      message: "Cerrando busqueda de formaciones...",
      processedCount: uniqueCandidates.length,
      totalCount: uniqueCandidates.length,
      successCount,
      failedCount
    });

    return {
      processedCount: uniqueCandidates.length,
      successCount,
      failedCount,
      metadata: { providers: this.providers.map((provider) => provider.name) }
    };
  }
}
