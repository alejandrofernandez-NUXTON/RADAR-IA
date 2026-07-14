import { readFile } from "fs/promises";
import { NewsStatus, TelegramMessageKind, TelegramStatus, VideoDigestStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SettingsService } from "@/lib/services/settings-service";
import { TelegramPendingNewsService } from "@/lib/services/telegram-pending-news-service";
import { LogService } from "@/lib/services/log-service";
import { LocalVideoStorageProvider } from "@/video/services/video-storage-service";
import { VideoDigestError } from "@/video/errors";
import { asStringArray } from "@/lib/utils";
import type { JobProgressReporter } from "@/lib/types";

function formatTags(tags: string[]) {
  return tags
    .slice(0, 6)
    .map((tag) => `#${tag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "")}`)
    .filter((tag) => tag.length > 1)
    .join(" ");
}

function replaceTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, value), template);
}

function extractTelegramMessageId(payload: Record<string, unknown>) {
  const result = payload.result;
  if (!result || typeof result !== "object") return null;
  const messageId = (result as Record<string, unknown>).message_id;
  return typeof messageId === "number" || typeof messageId === "string" ? String(messageId) : null;
}

export class TelegramService {
  private pendingNewsService = new TelegramPendingNewsService();

  async getBotInfo() {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken) throw new Error("Telegram bot token is not configured.");

    const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getMe`, {
      signal: AbortSignal.timeout(20_000)
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.ok === false) {
      throw new Error(typeof payload.description === "string" ? payload.description : "Telegram getMe failed.");
    }
    return payload;
  }

  async getConfiguredChat() {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      throw new Error("Telegram bot token or chat id is not configured.");
    }

    const response = await fetch(
      `https://api.telegram.org/bot${settings.telegramBotToken}/getChat?chat_id=${encodeURIComponent(settings.telegramChatId)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.ok === false) {
      throw new Error(typeof payload.description === "string" ? payload.description : "Telegram getChat failed.");
    }
    return payload;
  }

  async discoverChats() {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken) throw new Error("Telegram bot token is not configured.");

    const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/getUpdates?limit=100`, {
      signal: AbortSignal.timeout(20_000)
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: Array<Record<string, unknown>>;
    };
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.description || "Telegram getUpdates failed.");
    }

    const chats = new Map<string, { id: string; title: string; type: string }>();
    for (const update of payload.result || []) {
      const candidates = [
        (update.message as Record<string, unknown> | undefined)?.chat,
        (update.edited_message as Record<string, unknown> | undefined)?.chat,
        (update.channel_post as Record<string, unknown> | undefined)?.chat,
        (update.my_chat_member as Record<string, unknown> | undefined)?.chat
      ];

      for (const rawChat of candidates) {
        if (!rawChat || typeof rawChat !== "object") continue;
        const chat = rawChat as Record<string, unknown>;
        const id = String(chat.id || "");
        if (!id) continue;
        const title = String(chat.title || chat.username || chat.first_name || "Chat sin titulo");
        const type = String(chat.type || "unknown");
        chats.set(id, { id, title, type });
      }
    }

    return Array.from(chats.values());
  }

  async saveFirstDetectedChat() {
    const chats = await this.discoverChats();
    if (chats.length !== 1) {
      return { saved: false, chats };
    }

    await SettingsService.set("telegram.chatId", chats[0].id, true);
    return { saved: true, chats };
  }

  async sendNewsItem(newsItemId: string) {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      throw new Error("Telegram bot token or chat id is not configured.");
    }

    const newsItem = await prisma.newsItem.findUnique({ where: { id: newsItemId } });
    if (!newsItem) throw new Error("News item not found.");
    if (newsItem.videoDigestReservationId) {
      throw new Error(`La noticia esta reservada por el video ${newsItem.videoDigestReservationId}. Cancela o envia ese video antes.`);
    }
    if (newsItem.sentToTelegramAt || newsItem.status === NewsStatus.SENT_TO_TELEGRAM) {
      return { skipped: true, reason: "already_sent" };
    }

    const previous = await prisma.telegramMessage.findFirst({
      where: { newsItemId, status: TelegramStatus.SENT },
      orderBy: { sentAt: "desc" }
    });
    if (previous) {
      return { skipped: true, messageId: previous.id };
    }

    const businessApplications = asStringArray(newsItem.businessApplications).slice(0, 2).join("\n");
    const tags = asStringArray(newsItem.tags);
    const messageText = replaceTemplate(settings.telegramTemplate, {
      title: newsItem.title,
      shortSummary: newsItem.shortSummary,
      whyItMatters: newsItem.whyItMatters,
      businessApplications: businessApplications || "Revisar posibles aplicaciones internas.",
      sourceUrl: newsItem.sourceUrl,
      tags: formatTags(tags)
    });

    const message = await prisma.telegramMessage.create({
      data: {
        kind: TelegramMessageKind.NEWS_TEXT,
        newsItemId,
        chatId: settings.telegramChatId,
        messageText,
        status: TelegramStatus.PENDING
      }
    });

    try {
      const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text: messageText,
          disable_web_page_preview: false
        }),
        signal: AbortSignal.timeout(30_000)
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.ok === false) {
        throw new Error(typeof payload.description === "string" ? payload.description : `Telegram failed with status ${response.status}`);
      }

      const sentAt = new Date();
      await prisma.$transaction([
        prisma.telegramMessage.update({
          where: { id: message.id },
          data: {
            status: TelegramStatus.SENT,
            telegramMessageId: extractTelegramMessageId(payload),
            telegramResponse: payload as Prisma.InputJsonValue,
            sentAt
          }
        }),
        prisma.newsItem.update({
          where: { id: newsItemId },
          data: {
            status: NewsStatus.SENT_TO_TELEGRAM,
            sentToTelegramAt: sentAt
          }
        })
      ]);

      return { skipped: false, messageId: message.id };
    } catch (error) {
      await prisma.telegramMessage.update({
        where: { id: message.id },
        data: {
          status: TelegramStatus.FAILED,
          errorMessage: (error as Error).message
        }
      });
      throw error;
    }
  }

  async sendPending(progress?: JobProgressReporter, options: { ignoreAutoDisabled?: boolean } = {}) {
    const settings = await SettingsService.getAll();
    if (settings.telegramDeliveryMode === "video_digest_manual") {
      await progress?.({
        percent: 100,
        message: "Envio individual omitido: el modo activo agrupa las noticias en videos con envio manual.",
        processedCount: 0,
        successCount: 0,
        failedCount: 0
      });
      return {
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        metadata: { skipped: true, reason: "video_digest_manual" }
      };
    }
    if (!settings.telegramEnabled && !options.ignoreAutoDisabled) {
      await progress?.({ percent: 100, message: "El envio automatico a Telegram esta desactivado.", processedCount: 0, successCount: 0, failedCount: 0 });
      return { processedCount: 0, successCount: 0, failedCount: 0, metadata: { disabled: true } };
    }

    if (!settings.telegramEnabled && options.ignoreAutoDisabled) {
      await progress?.({
        percent: 4,
        message: "Envio manual iniciado. El envio automatico esta desactivado, pero este boton lo ignora.",
        processedCount: 0,
        successCount: 0,
        failedCount: 0
      });
    }

    const pending = await this.pendingNewsService.listEligibleNews(20);

    if (!pending.length) {
      await progress?.({
        percent: 100,
        message: "No hay noticias pendientes que cumplan criterios: publicadas, telegramWorthy, score suficiente y sin envio previo.",
        processedCount: 0,
        successCount: 0,
        failedCount: 0
      });
      return { processedCount: 0, successCount: 0, failedCount: 0 };
    }

    await progress?.({ percent: 8, message: `Preparando ${pending.length} envio(s) a Telegram...`, totalCount: pending.length });

    let successCount = 0;
    let failedCount = 0;
    for (const [index, item] of pending.entries()) {
      progress?.throwIfCancelled?.();
      const processedCount = index + 1;
      try {
        await progress?.({
          percent: 10 + Math.round((index / pending.length) * 84),
          message: `Enviando ${processedCount}/${pending.length}: ${item.title}`,
          processedCount,
          totalCount: pending.length,
          successCount,
          failedCount
        });
        await this.sendNewsItem(item.id);
        successCount += 1;
      } catch {
        if (progress?.signal?.aborted) {
          throw new Error(typeof progress.signal.reason === "string" ? progress.signal.reason : "Proceso detenido manualmente.");
        }
        failedCount += 1;
      }
      await progress?.({
        percent: 10 + Math.round((processedCount / pending.length) * 84),
        message: `Procesado envio ${processedCount}/${pending.length}`,
        processedCount,
        totalCount: pending.length,
        successCount,
        failedCount
      });
    }

    await progress?.({
      percent: 96,
      message: "Cerrando envios a Telegram...",
      processedCount: pending.length,
      totalCount: pending.length,
      successCount,
      failedCount
    });

    return { processedCount: pending.length, successCount, failedCount };
  }

  async sendVideoDigest(videoDigestId: string) {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      throw new VideoDigestError("TELEGRAM_VIDEO_UPLOAD_ERROR", "Configura el bot token y el chat ID de Telegram.");
    }

    const digest = await prisma.videoDigest.findUnique({
      where: { id: videoDigestId },
      include: { items: { select: { id: true } } }
    });
    if (!digest) throw new VideoDigestError("VIDEO_DIGEST_NOT_FOUND", "El video solicitado no existe.");
    if (digest.status === VideoDigestStatus.SENT) return { skipped: true, reason: "already_sent" };
    if (digest.status !== VideoDigestStatus.READY && digest.status !== VideoDigestStatus.SEND_FAILED) {
      throw new VideoDigestError("VIDEO_DIGEST_INVALID_STATE", `El video no se puede enviar desde el estado ${digest.status}.`);
    }
    if (digest.deliveryUncertain) {
      throw new VideoDigestError(
        "TELEGRAM_VIDEO_DELIVERY_UNCERTAIN",
        "El intento anterior tiene resultado incierto. Comprueba el grupo antes de decidir un reintento."
      );
    }
    if (!digest.videoStorageKey) throw new VideoDigestError("VIDEO_FILE_NOT_FOUND", "El video no tiene un archivo asociado.");

    const storage = await LocalVideoStorageProvider.create();
    const videoFile = await storage.open(digest.videoStorageKey);
    if (videoFile.size > 50 * 1024 * 1024) {
      throw new VideoDigestError("TELEGRAM_VIDEO_UPLOAD_ERROR", "El archivo supera el limite actual de 50 MB de Telegram Bot API.");
    }
    const validated = await this.pendingNewsService.assertDigestStillSendable(videoDigestId);
    const acquired = await prisma.videoDigest.updateMany({
      where: {
        id: videoDigestId,
        status: { in: [VideoDigestStatus.READY, VideoDigestStatus.SEND_FAILED] },
        deliveryUncertain: false
      },
      data: {
        status: VideoDigestStatus.SENDING,
        sendAttempts: { increment: 1 },
        errorCode: null,
        errorMessage: null
      }
    });
    if (acquired.count !== 1) return { skipped: true, reason: "already_sending" };

    const caption = [
      "Resumen de novedades de IA",
      "",
      "Principales noticias seleccionadas por Nuxton Knowledge Platform.",
      `Noticias incluidas: ${validated.items.length}`,
      `Duracion: ${formatVideoDuration(digest.durationSeconds)}`
    ].join("\n");
    let message: Awaited<ReturnType<typeof prisma.telegramMessage.create>> | null = null;
    let telegramConfirmed = false;
    let confirmedFailure = false;
    let uploadStarted = false;
    try {
      message = await prisma.telegramMessage.create({
        data: {
          kind: TelegramMessageKind.VIDEO_DIGEST,
          videoDigestId,
          chatId: settings.telegramChatId,
          messageText: caption,
          status: TelegramStatus.PENDING
        }
      });
      const messageRecordId = message.id;
      await LogService.info("video.send.started", "Subiendo video a Telegram por orden manual.", {
        videoDigestId,
        telegramMessageRecordId: message.id,
        sizeBytes: videoFile.size
      });
      const form = new FormData();
      form.set("chat_id", settings.telegramChatId);
      form.set("caption", caption);
      form.set("supports_streaming", "true");
      if (digest.width) form.set("width", String(digest.width));
      if (digest.height) form.set("height", String(digest.height));
      if (digest.durationSeconds) form.set("duration", String(digest.durationSeconds));
      const bytes = await readFile(videoFile.absolutePath);
      form.set("video", new Blob([bytes], { type: "video/mp4" }), "nuxton-radar-ia.mp4");

      uploadStarted = true;
      const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendVideo`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(10 * 60_000)
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok || payload.ok === false) {
        confirmedFailure = true;
        throw new Error(typeof payload.description === "string" ? payload.description : `Telegram devolvio HTTP ${response.status}.`);
      }
      telegramConfirmed = true;
      const sentAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.telegramMessage.update({
          where: { id: messageRecordId },
          data: {
            status: TelegramStatus.SENT,
            telegramMessageId: extractTelegramMessageId(payload),
            telegramResponse: payload as Prisma.InputJsonValue,
            sentAt,
            deliveryUncertain: false,
            errorMessage: null
          }
        });
        const digestUpdate = await tx.videoDigest.updateMany({
          where: { id: videoDigestId, status: VideoDigestStatus.SENDING },
          data: {
            status: VideoDigestStatus.SENT,
            sentAt,
            deliveryUncertain: false,
            errorCode: null,
            errorMessage: null
          }
        });
        const newsUpdate = await tx.newsItem.updateMany({
          where: {
            videoDigestReservationId: videoDigestId,
            status: NewsStatus.PUBLISHED,
            sentToTelegramAt: null
          },
          data: {
            status: NewsStatus.SENT_TO_TELEGRAM,
            sentToTelegramAt: sentAt,
            videoDigestReservationId: null
          }
        });
        if (digestUpdate.count !== 1 || newsUpdate.count !== validated.items.length) {
          throw new VideoDigestError(
            "VIDEO_DIGEST_INTEGRITY_ERROR",
            `Telegram confirmo el envio, pero la transaccion esperaba ${validated.items.length} noticias y encontro ${newsUpdate.count}.`
          );
        }
      });
      void LogService.info("video.send.completed", "Video confirmado por Telegram y noticias marcadas como enviadas.", {
        videoDigestId,
        newsCount: validated.items.length,
        telegramMessageId: extractTelegramMessageId(payload)
      }).catch(() => undefined);
      return { skipped: false, messageId: messageRecordId, telegramMessageId: extractTelegramMessageId(payload) };
    } catch (error) {
      const uncertain = telegramConfirmed || (uploadStarted && !confirmedFailure);
      const code = uncertain ? "TELEGRAM_VIDEO_DELIVERY_UNCERTAIN" : "TELEGRAM_VIDEO_UPLOAD_ERROR";
      const errorMessage = error instanceof Error ? error.message : "Error desconocido subiendo el video.";
      await prisma.$transaction(async (tx) => {
        if (message) {
          await tx.telegramMessage.update({
            where: { id: message.id },
            data: {
              status: TelegramStatus.FAILED,
              deliveryUncertain: uncertain,
              errorMessage
            }
          });
        }
        await tx.videoDigest.updateMany({
          where: { id: videoDigestId, status: VideoDigestStatus.SENDING },
          data: {
            status: VideoDigestStatus.SEND_FAILED,
            deliveryUncertain: uncertain,
            errorCode: code,
            errorMessage
          }
        });
      });
      void LogService.error("video.send.failed", "No se pudo confirmar el envio del video.", {
        videoDigestId,
        errorCode: code,
        deliveryUncertain: uncertain,
        error: errorMessage
      }).catch(() => undefined);
      throw new VideoDigestError(code, uncertain ? `${errorMessage} Comprueba el grupo antes de reintentar.` : errorMessage, {
        cause: error
      });
    }
  }

  async sendTestMessage() {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      throw new Error("Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID antes de probar.");
    }

    const response = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: "Prueba de conexion desde el Radar de IA.",
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(30_000)
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || payload.ok === false) {
      throw new Error(typeof payload.description === "string" ? payload.description : "Telegram test failed.");
    }
    return payload;
  }
}

function formatVideoDuration(seconds?: number | null) {
  if (!seconds) return "sin calcular";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
