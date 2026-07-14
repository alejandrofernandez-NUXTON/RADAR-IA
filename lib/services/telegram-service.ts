import { NewsStatus, TelegramStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SettingsService } from "@/lib/services/settings-service";
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

export class TelegramService {
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

  async sendNewsItem(newsItemId: string, options: { force?: boolean } = {}) {
    const settings = await SettingsService.getAll();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      throw new Error("Telegram bot token or chat id is not configured.");
    }

    const newsItem = await prisma.newsItem.findUnique({ where: { id: newsItemId } });
    if (!newsItem) throw new Error("News item not found.");

    const previous = await prisma.telegramMessage.findFirst({
      where: { newsItemId, status: TelegramStatus.SENT },
      orderBy: { sentAt: "desc" }
    });
    if (previous && !options.force) {
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

      await prisma.telegramMessage.update({
        where: { id: message.id },
        data: {
          status: TelegramStatus.SENT,
          telegramResponse: payload as Prisma.InputJsonValue,
          sentAt: new Date()
        }
      });

      await prisma.newsItem.update({
        where: { id: newsItemId },
        data: {
          status: NewsStatus.SENT_TO_TELEGRAM,
          sentToTelegramAt: new Date()
        }
      });

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

    const pending = await prisma.newsItem.findMany({
      where: {
        status: NewsStatus.PUBLISHED,
        telegramWorthy: true,
        overallScore: { gte: settings.telegramThreshold },
        telegramMessages: { none: { status: TelegramStatus.SENT } }
      },
      orderBy: [{ overallScore: "desc" }, { createdAt: "desc" }],
      take: 20
    });

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
