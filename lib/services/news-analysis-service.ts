import { createHash } from "crypto";
import { CollectedItemStatus, NewsStatus, RecommendedAction, TelegramStatus } from "@prisma/client";
import type { CollectedSourceItem, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GeminiService } from "@/lib/services/gemini-service";
import { LogService } from "@/lib/services/log-service";
import { SettingsService } from "@/lib/services/settings-service";
import { SourceService } from "@/lib/services/source-service";
import { TelegramService } from "@/lib/services/telegram-service";
import { shouldAutoSendIndividual } from "@/lib/services/telegram-delivery-policy";
import type { JobProgressReporter, JobResult, SourceContent } from "@/lib/types";

const recommendedActionMap = {
  publish: RecommendedAction.PUBLISH,
  review: RecommendedAction.REVIEW,
  discard: RecommendedAction.DISCARD
} as const;

function contentHash(content: SourceContent) {
  return createHash("sha256")
    .update([content.sourceUrl, content.title, content.description || "", content.transcript || ""].join("\n"))
    .digest("hex");
}

function jsonSafe(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceContentFromCollected(item: CollectedSourceItem & { source: Source | null }): SourceContent | null {
  if (!item.source) return null;
  return {
    source: item.source,
    sourceUrl: item.sourceUrl,
    externalId: item.externalId || undefined,
    title: item.title,
    author: item.author || undefined,
    description: item.description || undefined,
    transcript: item.transcript || undefined,
    publishedAt: item.publishedAt || undefined,
    rawMetadata:
      item.rawMetadata && typeof item.rawMetadata === "object" && !Array.isArray(item.rawMetadata)
        ? (item.rawMetadata as Record<string, unknown>)
        : undefined
  };
}

function newsStatusFor(action: "publish" | "review" | "discard", score: number, publishThreshold: number) {
  if (action === "discard") return NewsStatus.DISCARDED;
  if (score >= publishThreshold || action === "publish") return NewsStatus.PUBLISHED;
  return NewsStatus.REVIEW;
}

function isAnalysisUnavailable(raw: unknown) {
  return Boolean(raw && typeof raw === "object" && "analysisUnavailable" in raw && (raw as { analysisUnavailable?: unknown }).analysisUnavailable);
}

export class NewsAnalysisService {
  private sourceService = new SourceService();
  private geminiService = new GeminiService();
  private telegramService = new TelegramService();

  async collectLatestFromActiveSources(progress?: JobProgressReporter): Promise<JobResult> {
    const settings = await SettingsService.getAll();
    const sources = await this.sourceService.getActiveSources(settings.maxSourcesPerRun);
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    if (!sources.length) {
      await progress?.({ percent: 100, message: "No hay fuentes activas para recoger.", processedCount: 0, successCount: 0, failedCount: 0 });
      return { processedCount, successCount, failedCount, metadata: { sourceCount: 0, duplicateCount } };
    }

    await progress?.({ percent: 5, message: `Preparando recogida de ${sources.length} fuente(s)...`, totalCount: sources.length });

    for (const [sourceIndex, source] of sources.entries()) {
      const percent = 8 + Math.round((sourceIndex / sources.length) * 84);
      try {
        await progress?.({
          percent,
          message: `Consultando ultima publicacion de ${source.name}...`,
          processedCount,
          successCount,
          failedCount,
          totalCount: sources.length
        });

        const contents = await this.sourceService.fetchLatestContents(source);
        if (!contents.length) {
          await progress?.({
            percent: Math.min(95, percent + 4),
            message: `${source.name} no devolvio publicaciones nuevas.`,
            processedCount,
            successCount,
            failedCount,
            totalCount: sources.length
          });
        }

        for (const content of contents) {
          processedCount += 1;
          const saved = await this.saveCollectedContent(content);
          if (saved.created) {
            successCount += 1;
            await progress?.({
              percent: Math.min(95, percent + 6),
              message: `Publicacion guardada: ${content.title}`,
              processedCount,
              successCount,
              failedCount,
              totalCount: sources.length
            });
          } else {
            duplicateCount += 1;
            await progress?.({
              percent: Math.min(95, percent + 6),
              message: `Ya estaba recogida: ${content.title}`,
              processedCount,
              successCount,
              failedCount,
              totalCount: sources.length
            });
          }
        }

        await this.sourceService.markProcessed(source.id);
      } catch (error) {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        failedCount += 1;
        await progress?.({
          percent: Math.min(95, percent + 6),
          message: `No se pudo recoger ${source.name}: ${(error as Error).message}`,
          processedCount,
          successCount,
          failedCount,
          totalCount: sources.length
        });
        await LogService.error("source.collection", `Error recogiendo fuente ${source.name}`, {
          sourceId: source.id,
          sourceType: source.type,
          error: (error as Error).message
        });
      }
    }

    await progress?.({
      percent: 96,
      message: "Cerrando recogida de fuentes...",
      processedCount,
      successCount,
      failedCount,
      totalCount: sources.length
    });

    return {
      processedCount,
      successCount,
      failedCount,
      metadata: { sourceCount: sources.length, duplicateCount }
    };
  }

  async processPendingCollectedItems(progress?: JobProgressReporter): Promise<JobResult> {
    const settings = await SettingsService.getAll();
    const pending = await prisma.collectedSourceItem.findMany({
      where: { status: CollectedItemStatus.PENDING },
      include: { source: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "asc" }],
      take: Math.max(1, settings.maxSourcesPerRun * 5)
    });
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    if (!pending.length) {
      await progress?.({ percent: 100, message: "No hay publicaciones pendientes de procesar.", processedCount: 0, successCount: 0, failedCount: 0 });
      return { processedCount, successCount, failedCount, metadata: { pendingCount: 0 } };
    }

    await progress?.({ percent: 5, message: `Preparando analisis de ${pending.length} publicacion(es)...`, totalCount: pending.length });

    for (const [index, item] of pending.entries()) {
      const percent = 8 + Math.round((index / pending.length) * 84);
      processedCount += 1;

      try {
        const content = sourceContentFromCollected(item);
        if (!content) throw new Error("La fuente original ya no existe.");

        await progress?.({
          percent,
          message: `Esperando respuesta de Gemini para: ${item.title}`,
          processedCount,
          successCount,
          failedCount,
          totalCount: pending.length
        });

        const result = await this.processContent(content, { signal: progress?.signal });
        if ("error" in result && result.error) {
          failedCount += 1;
          await prisma.collectedSourceItem.update({
            where: { id: item.id },
            data: {
              status: CollectedItemStatus.ERROR,
              processedAt: new Date(),
              errorMessage: "Gemini no pudo generar un analisis valido."
            }
          });
        } else {
          successCount += 1;
          await prisma.collectedSourceItem.update({
            where: { id: item.id },
            data: {
              status: CollectedItemStatus.PROCESSED,
              processedAt: new Date(),
              errorMessage: null
            }
          });
        }

        await progress?.({
          percent: Math.min(95, percent + 5),
          message: `Procesado: ${item.title}`,
          processedCount,
          successCount,
          failedCount,
          totalCount: pending.length
        });
      } catch (error) {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        failedCount += 1;
        await prisma.collectedSourceItem.update({
          where: { id: item.id },
          data: {
            status: CollectedItemStatus.ERROR,
            processedAt: new Date(),
            errorMessage: (error as Error).message
          }
        });
        await LogService.error("news.processing", "Error procesando publicacion recogida", {
          collectedItemId: item.id,
          sourceUrl: item.sourceUrl,
          error: (error as Error).message
        });
        await progress?.({
          percent: Math.min(95, percent + 5),
          message: `Error procesando ${item.title}: ${(error as Error).message}`,
          processedCount,
          successCount,
          failedCount,
          totalCount: pending.length
        });
      }
    }

    await progress?.({
      percent: 96,
      message: "Cerrando procesado de noticias...",
      processedCount,
      successCount,
      failedCount,
      totalCount: pending.length
    });

    return { processedCount, successCount, failedCount, metadata: { pendingCount: pending.length } };
  }

  async processActiveSources(progress?: JobProgressReporter): Promise<JobResult> {
    const settings = await SettingsService.getAll();
    const sources = await this.sourceService.getActiveSources(settings.maxSourcesPerRun);
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    if (!sources.length) {
      await progress?.({ percent: 100, message: "No hay fuentes activas para procesar.", processedCount: 0, successCount: 0, failedCount: 0 });
      return { processedCount, successCount, failedCount, metadata: { sourceCount: 0 } };
    }

    await progress?.({ percent: 5, message: `Preparando ${sources.length} fuente(s) activa(s)...`, totalCount: sources.length });

    for (const [sourceIndex, source] of sources.entries()) {
      try {
        const sourceStartPercent = 8 + Math.round((sourceIndex / sources.length) * 82);
        await progress?.({
          percent: sourceStartPercent,
          message: `Leyendo fuente ${sourceIndex + 1}/${sources.length}: ${source.name}`,
          processedCount,
          successCount,
          failedCount,
          totalCount: sources.length
        });
        const contents = await this.sourceService.fetchContents(source, 5);
        const totalContents = Math.max(contents.length, 1);
        for (const [contentIndex, content] of contents.entries()) {
          processedCount += 1;
          const percent = 8 + Math.round(((sourceIndex + (contentIndex + 0.5) / totalContents) / sources.length) * 82);
          await progress?.({
            percent,
            message: `Analizando ${contentIndex + 1}/${contents.length} de ${source.name}`,
            processedCount,
            successCount,
            failedCount,
            totalCount: sources.length
          });
          const result = await this.processContent(content, { signal: progress?.signal });
          if (result.created) successCount += 1;
          await progress?.({
            percent: Math.min(94, percent + 3),
            message: `Guardado resultado de ${content.title}`,
            processedCount,
            successCount,
            failedCount,
            totalCount: sources.length
          });
        }
        await this.sourceService.markProcessed(source.id);
      } catch (error) {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        failedCount += 1;
        await LogService.error("news.source", `Error procesando fuente ${source.name}`, {
          sourceId: source.id,
          error: (error as Error).message
        });
      }
    }

    await progress?.({
      percent: 96,
      message: "Cerrando ejecucion de noticias...",
      processedCount,
      successCount,
      failedCount,
      totalCount: sources.length
    });

    return {
      processedCount,
      successCount,
      failedCount,
      metadata: { sourceCount: sources.length }
    };
  }

  async processSource(sourceId: string) {
    const contents = await this.sourceService.fetchContentsForSource(sourceId, 5);
    const results = [];
    for (const content of contents) {
      results.push(await this.processContent(content));
    }
    await this.sourceService.markProcessed(sourceId);
    return results;
  }

  async reprocessNewsItem(newsItemId: string) {
    const item = await prisma.newsItem.findUnique({ where: { id: newsItemId }, include: { source: true } });
    if (!item?.source) throw new Error("La noticia no tiene fuente asociada para reprocesar.");
    if (item.videoDigestReservationId) {
      throw new Error(`La noticia esta reservada por el video ${item.videoDigestReservationId}. Cancela el video antes de reprocesar.`);
    }
    const contents = await this.sourceService.fetchContentsForSource(item.source.id, 5);
    const content = contents.find((entry) => entry.sourceUrl === item.sourceUrl) || contents[0];
    if (!content) throw new Error("No se pudo recuperar contenido de la fuente.");
    await prisma.newsItem.delete({ where: { id: newsItemId } });
    return this.processContent(content, { force: true });
  }

  private async processContent(content: SourceContent, options: { force?: boolean; signal?: AbortSignal } = {}) {
    const hash = contentHash(content);

    if (!options.force) {
      const duplicate = await prisma.newsItem.findFirst({
        where: {
          OR: [{ sourceUrl: content.sourceUrl }, { contentHash: hash }]
        }
      });
      if (duplicate) return { created: false, id: duplicate.id, duplicate: true };
    }

    try {
      const settings = await SettingsService.getAll();
      const { parsed, raw } = await this.geminiService.analyzeNews(content, options.signal);
      const status = isAnalysisUnavailable(raw) ? NewsStatus.ERROR : newsStatusFor(parsed.recommendedAction, parsed.overallScore, settings.publishThreshold);
      const shouldSendTelegram = shouldAutoSendIndividual({
        telegramEnabled: settings.telegramEnabled,
        deliveryMode: settings.telegramDeliveryMode,
        status,
        telegramWorthy: parsed.telegramWorthy,
        overallScore: parsed.overallScore,
        telegramThreshold: settings.telegramThreshold
      });

      const newsItem = await prisma.newsItem.create({
        data: {
          sourceId: content.source.id,
          sourceUrl: content.sourceUrl,
          contentHash: hash,
          externalId: content.externalId,
          title: parsed.title,
          shortSummary: parsed.shortSummary,
          longSummary: parsed.longSummary,
          keyPoints: parsed.keyPoints,
          whyItMatters: parsed.whyItMatters,
          businessApplications: parsed.businessApplications,
          toolsMentioned: parsed.toolsMentioned,
          companiesMentioned: parsed.companiesMentioned,
          categories: parsed.categories,
          tags: parsed.tags,
          noveltyScore: parsed.noveltyScore,
          relevanceScore: parsed.relevanceScore,
          practicalityScore: parsed.practicalityScore,
          urgencyScore: parsed.urgencyScore,
          overallScore: parsed.overallScore,
          recommendedAction: recommendedActionMap[parsed.recommendedAction],
          telegramWorthy: parsed.telegramWorthy,
          status,
          publishedAt: status === NewsStatus.PUBLISHED ? new Date() : null,
          rawGeminiResponse: raw as Prisma.InputJsonValue,
          rawSourceMetadata: jsonSafe({
            title: content.title,
            author: content.author,
            description: content.description,
            publishedAt: content.publishedAt?.toISOString(),
            ...content.rawMetadata
          })
        }
      });

      if (shouldSendTelegram) {
        try {
          await this.telegramService.sendNewsItem(newsItem.id);
        } catch (error) {
          await LogService.error("telegram.auto-send", "No se pudo enviar noticia automaticamente a Telegram", {
            newsItemId: newsItem.id,
            error: (error as Error).message
          });
        }
      }

      return { created: true, id: newsItem.id };
    } catch (error) {
      if (options.signal?.aborted) {
        throw new Error(typeof options.signal.reason === "string" ? options.signal.reason : "Proceso detenido manualmente.");
      }
      await LogService.error("news.analysis", "Error analizando contenido", {
        sourceId: content.source.id,
        sourceUrl: content.sourceUrl,
        error: (error as Error).message
      });

      const errorItem = await prisma.newsItem.create({
        data: {
          sourceId: content.source.id,
          sourceUrl: content.sourceUrl,
          contentHash: hash,
          externalId: content.externalId,
          title: content.title || "Error de analisis",
          shortSummary: "No se pudo analizar esta fuente.",
          longSummary: (error as Error).message,
          whyItMatters: "Requiere revision tecnica.",
          status: NewsStatus.ERROR,
          recommendedAction: RecommendedAction.REVIEW,
          rawSourceMetadata: jsonSafe(content.rawMetadata || {})
        }
      });
      return { created: true, id: errorItem.id, error: true };
    }
  }

  private async saveCollectedContent(content: SourceContent) {
    const hash = contentHash(content);
    const duplicate = await prisma.collectedSourceItem.findFirst({
      where: {
        OR: [{ sourceUrl: content.sourceUrl }, { contentHash: hash }]
      }
    });
    if (duplicate) return { created: false, id: duplicate.id, duplicate: true };

    const item = await prisma.collectedSourceItem.create({
      data: {
        sourceId: content.source.id,
        sourceUrl: content.sourceUrl,
        contentHash: hash,
        externalId: content.externalId,
        title: content.title,
        author: content.author,
        description: content.description,
        transcript: content.transcript,
        publishedAt: content.publishedAt,
        rawMetadata: jsonSafe({
          title: content.title,
          author: content.author,
          description: content.description,
          publishedAt: content.publishedAt?.toISOString(),
          ...content.rawMetadata
        })
      }
    });

    return { created: true, id: item.id };
  }

  async sendPendingToTelegram(
    progress?: JobProgressReporter,
    options: { ignoreAutoDisabled?: boolean; scheduled?: boolean } = {}
  ): Promise<JobResult> {
    const result = await this.telegramService.sendPending(progress, options);
    const failedMessages = await prisma.telegramMessage.count({ where: { status: TelegramStatus.FAILED } });
    return {
      ...result,
      metadata: { ...result.metadata, failedMessages }
    };
  }
}
