import { createHash } from "crypto";
import { NewsStatus, RecommendedAction, TelegramStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GeminiService } from "@/lib/services/gemini-service";
import { LogService } from "@/lib/services/log-service";
import { SettingsService } from "@/lib/services/settings-service";
import { SourceService } from "@/lib/services/source-service";
import { TelegramService } from "@/lib/services/telegram-service";
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
          const result = await this.processContent(content);
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
    const contents = await this.sourceService.fetchContentsForSource(item.source.id, 5);
    const content = contents.find((entry) => entry.sourceUrl === item.sourceUrl) || contents[0];
    if (!content) throw new Error("No se pudo recuperar contenido de la fuente.");
    await prisma.newsItem.delete({ where: { id: newsItemId } });
    return this.processContent(content, { force: true });
  }

  private async processContent(content: SourceContent, options: { force?: boolean } = {}) {
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
      const { parsed, raw } = await this.geminiService.analyzeNews(content);
      const status = isAnalysisUnavailable(raw) ? NewsStatus.ERROR : newsStatusFor(parsed.recommendedAction, parsed.overallScore, settings.publishThreshold);
      const shouldSendTelegram =
        settings.telegramEnabled &&
        status === NewsStatus.PUBLISHED &&
        parsed.telegramWorthy &&
        parsed.overallScore >= settings.telegramThreshold;

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

  async sendPendingToTelegram(progress?: JobProgressReporter): Promise<JobResult> {
    const result = await this.telegramService.sendPending(progress);
    const failedMessages = await prisma.telegramMessage.count({ where: { status: TelegramStatus.FAILED } });
    return {
      ...result,
      metadata: { ...result.metadata, failedMessages }
    };
  }
}
