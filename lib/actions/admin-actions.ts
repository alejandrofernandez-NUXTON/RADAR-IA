"use server";

import { NewsStatus, SourceType, TrainingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server-auth";
import { jobSchedulesInputSchema, settingsInputSchema, sourceInputSchema } from "@/lib/validation";
import { SettingsService } from "@/lib/services/settings-service";
import { JobService } from "@/lib/services/job-service";
import { TelegramService } from "@/lib/services/telegram-service";
import { NewsAnalysisService } from "@/lib/services/news-analysis-service";
import { LogService } from "@/lib/services/log-service";

function formString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const input = settingsInputSchema.parse({
    geminiApiKey: formString(formData, "geminiApiKey"),
    geminiModel: formString(formData, "geminiModel"),
    basePrompt: formString(formData, "basePrompt"),
    publishThreshold: formData.get("publishThreshold"),
    telegramThreshold: formData.get("telegramThreshold"),
    outputLanguage: formString(formData, "outputLanguage"),
    updateFrequencyHours: formData.get("updateFrequencyHours"),
    maxSourcesPerRun: formData.get("maxSourcesPerRun"),
    telegramEnabled: formData.get("telegramEnabled") === "on",
    telegramDeliveryMode: formString(formData, "telegramDeliveryMode"),
    telegramBotToken: formString(formData, "telegramBotToken"),
    telegramChatId: formString(formData, "telegramChatId"),
    telegramTemplate: formString(formData, "telegramTemplate"),
    videoEnabled: formData.get("videoEnabled") === "on",
    videoMaxNewsItems: formData.get("videoMaxNewsItems"),
    videoMaxOpenDigests: formData.get("videoMaxOpenDigests"),
    videoTargetDurationSeconds: formData.get("videoTargetDurationSeconds"),
    videoWidth: formData.get("videoWidth"),
    videoHeight: formData.get("videoHeight"),
    videoFps: formData.get("videoFps"),
    videoLanguage: formString(formData, "videoLanguage"),
    videoTtsProvider: formString(formData, "videoTtsProvider"),
    videoTtsModel: formString(formData, "videoTtsModel"),
    videoTtsVoice: formString(formData, "videoTtsVoice"),
    videoSubtitlesEnabled: formData.get("videoSubtitlesEnabled") === "on",
    videoOutputDirectory: formString(formData, "videoOutputDirectory"),
    videoKeepTempFiles: formData.get("videoKeepTempFiles") === "on",
    videoRetentionDays: formData.get("videoRetentionDays"),
    videoFailedRetentionDays: formData.get("videoFailedRetentionDays"),
    xBearerToken: formString(formData, "xBearerToken"),
    openaiApiKey: formString(formData, "openaiApiKey"),
    openaiModel: formString(formData, "openaiModel"),
    openaiEnabled: formData.get("openaiEnabled") === "on"
  });

  await SettingsService.set("gemini.model", input.geminiModel);
  await SettingsService.set("analysis.basePrompt", input.basePrompt);
  await SettingsService.set("news.publishThreshold", String(input.publishThreshold));
  await SettingsService.set("news.telegramThreshold", String(input.telegramThreshold));
  await SettingsService.set("app.outputLanguage", input.outputLanguage);
  await SettingsService.set("jobs.updateFrequencyHours", String(input.updateFrequencyHours));
  await SettingsService.set("jobs.maxSourcesPerRun", String(input.maxSourcesPerRun));
  await SettingsService.set("telegram.enabled", String(input.telegramEnabled));
  await SettingsService.set("telegram.deliveryMode", input.telegramDeliveryMode);
  await SettingsService.set("telegram.messageTemplate", input.telegramTemplate);
  await SettingsService.set("video.enabled", String(input.videoEnabled));
  await SettingsService.set("video.maxNewsItems", String(input.videoMaxNewsItems));
  await SettingsService.set("video.maxOpenDigests", String(input.videoMaxOpenDigests));
  await SettingsService.set("video.targetDurationSeconds", String(input.videoTargetDurationSeconds));
  await SettingsService.set("video.width", String(input.videoWidth));
  await SettingsService.set("video.height", String(input.videoHeight));
  await SettingsService.set("video.fps", String(input.videoFps));
  await SettingsService.set("video.language", input.videoLanguage);
  await SettingsService.set("video.ttsProvider", input.videoTtsProvider);
  await SettingsService.set("video.ttsModel", input.videoTtsModel);
  await SettingsService.set("video.ttsVoice", input.videoTtsVoice);
  await SettingsService.set("video.subtitlesEnabled", String(input.videoSubtitlesEnabled));
  await SettingsService.set("video.outputDirectory", input.videoOutputDirectory);
  await SettingsService.set("video.keepTempFiles", String(input.videoKeepTempFiles));
  await SettingsService.set("video.retentionDays", String(input.videoRetentionDays));
  await SettingsService.set("video.failedRetentionDays", String(input.videoFailedRetentionDays));
  await SettingsService.set("openai.enabled", String(input.openaiEnabled));
  await SettingsService.set("openai.model", input.openaiModel || "");

  if (input.geminiApiKey) await SettingsService.set("gemini.apiKey", input.geminiApiKey, true);
  if (input.telegramBotToken) await SettingsService.set("telegram.botToken", input.telegramBotToken, true);
  if (input.telegramChatId) await SettingsService.set("telegram.chatId", input.telegramChatId, true);
  if (input.xBearerToken) await SettingsService.set("x.bearerToken", input.xBearerToken, true);
  if (input.openaiApiKey) await SettingsService.set("openai.apiKey", input.openaiApiKey, true);

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

export async function saveJobSchedulesAction(formData: FormData) {
  await requireAdmin();
  const input = jobSchedulesInputSchema.parse({
    collectFrequency: formString(formData, "collectFrequency"),
    collectTime: formString(formData, "collectTime"),
    collectWeekday: formString(formData, "collectWeekday"),
    processFrequency: formString(formData, "processFrequency"),
    processTime: formString(formData, "processTime"),
    processWeekday: formString(formData, "processWeekday"),
    telegramFrequency: formString(formData, "telegramFrequency"),
    telegramTime: formString(formData, "telegramTime"),
    telegramWeekday: formString(formData, "telegramWeekday")
  });

  await SettingsService.set("jobs.collectFrequency", input.collectFrequency);
  await SettingsService.set("jobs.collectTime", input.collectTime);
  await SettingsService.set("jobs.collectWeekday", input.collectWeekday);
  await SettingsService.set("jobs.processFrequency", input.processFrequency);
  await SettingsService.set("jobs.processTime", input.processTime);
  await SettingsService.set("jobs.processWeekday", input.processWeekday);
  await SettingsService.set("jobs.telegramFrequency", input.telegramFrequency);
  await SettingsService.set("jobs.telegramTime", input.telegramTime);
  await SettingsService.set("jobs.telegramWeekday", input.telegramWeekday);

  revalidatePath("/admin/jobs");
  redirect("/admin/jobs?schedule=saved");
}

export async function toggleJobSchedulesEnabledAction(formData: FormData) {
  await requireAdmin();
  const enabled = formString(formData, "enabled") === "true";
  await SettingsService.set("jobs.schedulesEnabled", String(enabled));
  await LogService.info("jobs.schedules", enabled ? "Contadores automaticos reactivados" : "Contadores automaticos pausados");
  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs?schedule=${enabled ? "enabled" : "paused"}`);
}

export async function createSourceAction(formData: FormData) {
  await requireAdmin();
  const input = sourceInputSchema.parse({
    name: formString(formData, "name"),
    type: formString(formData, "type"),
    url: formString(formData, "url"),
    category: formString(formData, "category"),
    language: formString(formData, "language") || "es",
    priority: formData.get("priority") || "1",
    active: formData.get("active") === "on",
    notes: formString(formData, "notes")
  });

  await prisma.source.upsert({
    where: { url: input.url },
    update: {
      name: input.name,
      type: input.type as SourceType,
      category: input.category,
      language: input.language,
      priority: input.priority,
      active: input.active,
      notes: input.notes
    },
    create: {
      name: input.name,
      type: input.type as SourceType,
      url: input.url,
      category: input.category,
      language: input.language,
      priority: input.priority,
      active: input.active,
      notes: input.notes
    }
  });

  revalidatePath("/admin/sources");
}

export async function toggleSourceAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const source = await prisma.source.findUnique({ where: { id } });
  if (source) {
    await prisma.source.update({ where: { id }, data: { active: !source.active } });
  }
  revalidatePath("/admin/sources");
}

export async function deleteSourceAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  await prisma.source.delete({ where: { id } });
  revalidatePath("/admin/sources");
}

export async function setNewsStatusAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const status = formString(formData, "status") as keyof typeof NewsStatus;
  if (!NewsStatus[status]) return;
  const reserved = await prisma.newsItem.findUnique({ where: { id }, select: { videoDigestReservationId: true } });
  if (reserved?.videoDigestReservationId && NewsStatus[status] !== NewsStatus.PUBLISHED) {
    await LogService.warn("news.reserved", "Cambio editorial bloqueado porque la noticia esta reservada.", {
      newsItemId: id,
      videoDigestId: reserved.videoDigestReservationId
    });
    return;
  }

  await prisma.newsItem.update({
    where: { id },
    data: {
      status: NewsStatus[status],
      publishedAt: NewsStatus[status] === NewsStatus.PUBLISHED ? new Date() : undefined
    }
  });
  revalidatePath("/admin/news");
  revalidatePath("/");
  revalidatePath("/news");
}

export async function toggleNewsFeaturedAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const item = await prisma.newsItem.findUnique({ where: { id } });
  if (item) {
    await prisma.newsItem.update({ where: { id }, data: { featured: !item.featured } });
  }
  revalidatePath("/admin/news");
}

export async function deleteNewsAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  if (!id) return;

  const item = await prisma.newsItem.findUnique({ where: { id }, select: { id: true, title: true, videoDigestReservationId: true } });
  if (!item) {
    revalidatePath("/admin/news");
    return;
  }
  if (item.videoDigestReservationId) {
    await LogService.warn("news.delete", "Eliminacion bloqueada porque la noticia esta reservada.", {
      newsItemId: id,
      videoDigestId: item.videoDigestReservationId
    });
    revalidatePath("/admin/news");
    return;
  }

  await prisma.telegramMessage.deleteMany({ where: { newsItemId: id } });
  await prisma.newsItem.delete({ where: { id } });
  await LogService.info("news.delete", "Noticia eliminada desde admin", {
    newsItemId: id,
    title: item.title
  });

  revalidatePath("/admin/news");
  revalidatePath("/");
  revalidatePath("/news");
}

export async function updateNewsContentAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  await prisma.newsItem.update({
    where: { id },
    data: {
      title: formString(formData, "title"),
      shortSummary: formString(formData, "shortSummary"),
      longSummary: formString(formData, "longSummary"),
      whyItMatters: formString(formData, "whyItMatters"),
      keyPoints: lines(String(formData.get("keyPoints") || "")),
      businessApplications: lines(String(formData.get("businessApplications") || "")),
      categories: csv(String(formData.get("categories") || "")),
      tags: csv(String(formData.get("tags") || ""))
    }
  });
  revalidatePath(`/admin/news/${id}`);
  revalidatePath("/admin/news");
  redirect(`/admin/news/${id}?saved=1`);
}

export async function sendNewsToTelegramAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  try {
    await new TelegramService().sendNewsItem(id);
    await LogService.info("telegram.manual", "Noticia enviada manualmente a Telegram", { newsItemId: id });
  } catch (error) {
    await LogService.error("telegram.manual", "Error enviando noticia manualmente", {
      newsItemId: id,
      error: (error as Error).message
    });
  }
  revalidatePath("/admin/news");
  revalidatePath(`/admin/news/${id}`);
}

export async function reprocessNewsAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const reserved = await prisma.newsItem.findUnique({ where: { id }, select: { videoDigestReservationId: true } });
  if (reserved?.videoDigestReservationId) {
    await LogService.warn("news.reprocess", "Reprocesado bloqueado porque la noticia esta reservada.", {
      newsItemId: id,
      videoDigestId: reserved.videoDigestReservationId
    });
    return;
  }
  await new NewsAnalysisService().reprocessNewsItem(id);
  revalidatePath("/admin/news");
  redirect("/admin/news");
}

export async function setTrainingStatusAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  const status = formString(formData, "status") as keyof typeof TrainingStatus;
  if (!TrainingStatus[status]) return;
  await prisma.trainingItem.update({ where: { id }, data: { status: TrainingStatus[status] } });
  revalidatePath("/admin/training");
  revalidatePath("/training");
}

export async function updateTrainingNoteAction(formData: FormData) {
  await requireAdmin();
  const id = formString(formData, "id");
  await prisma.trainingItem.update({
    where: { id },
    data: { internalNote: formString(formData, "internalNote") }
  });
  revalidatePath("/admin/training");
}

export async function runNewsJobAction() {
  await requireAdmin();
  await new JobService().runNewsJob();
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/news");
  revalidatePath("/");
}

export async function runTrainingJobAction() {
  await requireAdmin();
  await new JobService().runTrainingJob();
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/training");
  revalidatePath("/training");
}

export async function runTelegramPendingAction() {
  await requireAdmin();
  await new JobService().runTelegramPendingJob();
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/news");
}

export async function sendTelegramTestAction() {
  await requireAdmin();
  try {
    await new TelegramService().sendTestMessage();
    await LogService.info("telegram.test", "Mensaje de prueba enviado correctamente");
  } catch (error) {
    await LogService.error("telegram.test", "Error en mensaje de prueba", { error: (error as Error).message });
  }
  revalidatePath("/admin/settings");
}

export async function detectTelegramChatAction() {
  await requireAdmin();
  const result = await new TelegramService().saveFirstDetectedChat();
  if (result.saved) {
    await LogService.info("telegram.detect-chat", "Telegram chat ID detectado y guardado", {
      chatTitle: result.chats[0].title,
      chatType: result.chats[0].type
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/diagnostics");
    redirect("/admin/diagnostics?telegramChat=saved");
  }

  await LogService.warn("telegram.detect-chat", "No se pudo guardar automaticamente Telegram chat ID", {
    detectedChats: result.chats.map((chat) => ({ title: chat.title, type: chat.type, id: chat.id }))
  });
  revalidatePath("/admin/diagnostics");
  redirect(`/admin/diagnostics?telegramChat=${result.chats.length ? "multiple" : "none"}`);
}

export async function useCurrentGeminiModelAction() {
  await requireAdmin();
  await SettingsService.set("gemini.model", "gemini-3.5-flash");
  await LogService.info("gemini.settings", "Modelo Gemini actualizado a gemini-3.5-flash");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/diagnostics");
  redirect("/admin/diagnostics?geminiModel=updated");
}
