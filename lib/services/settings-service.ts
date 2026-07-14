import { DEFAULT_NEWS_ANALYSIS_PROMPT, DEFAULT_TELEGRAM_TEMPLATE } from "@/lib/prompts";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";

const defaults = {
  "gemini.model": process.env.GEMINI_MODEL || "gemini-3.5-flash",
  "analysis.basePrompt": DEFAULT_NEWS_ANALYSIS_PROMPT,
  "news.publishThreshold": "70",
  "news.telegramThreshold": "82",
  "app.outputLanguage": "es",
  "jobs.updateFrequencyHours": "6",
  "jobs.maxSourcesPerRun": "12",
  "jobs.timezone": "Europe/Madrid",
  "jobs.collectFrequency": "daily",
  "jobs.collectTime": "03:00",
  "jobs.collectWeekday": "monday",
  "jobs.processFrequency": "daily",
  "jobs.processTime": "03:30",
  "jobs.processWeekday": "monday",
  "jobs.telegramFrequency": "daily",
  "jobs.telegramTime": "04:00",
  "jobs.telegramWeekday": "monday",
  "jobs.schedulesEnabled": "true",
  "telegram.enabled": "false",
  "telegram.deliveryMode": process.env.TELEGRAM_DELIVERY_MODE || "legacy_individual",
  "telegram.messageTemplate": DEFAULT_TELEGRAM_TEMPLATE,
  "video.enabled": process.env.VIDEO_ENABLED || "false",
  "video.maxNewsItems": process.env.VIDEO_MAX_NEWS_ITEMS || "6",
  "video.maxOpenDigests": process.env.VIDEO_MAX_OPEN_DIGESTS || "1",
  "video.targetDurationSeconds": process.env.VIDEO_TARGET_DURATION_SECONDS || "150",
  "video.width": process.env.VIDEO_WIDTH || "1920",
  "video.height": process.env.VIDEO_HEIGHT || "1080",
  "video.fps": process.env.VIDEO_FPS || "30",
  "video.language": process.env.VIDEO_LANGUAGE || "es-ES",
  "video.ttsProvider": process.env.VIDEO_TTS_PROVIDER || "gemini",
  "video.ttsModel": process.env.VIDEO_TTS_MODEL || "gemini-3.1-flash-tts-preview",
  "video.ttsVoice": process.env.VIDEO_TTS_VOICE || "Kore",
  "video.subtitlesEnabled": "true",
  "video.outputDirectory": process.env.VIDEO_OUTPUT_DIRECTORY || "./data/video-digests",
  "video.keepTempFiles": "false",
  "video.retentionDays": "7",
  "video.failedRetentionDays": "2",
  "openai.enabled": "false",
  "openai.model": process.env.OPENAI_MODEL || ""
} as const;

const envFallbacks: Record<string, string | undefined> = {
  "gemini.apiKey": process.env.GEMINI_API_KEY,
  "telegram.botToken": process.env.TELEGRAM_BOT_TOKEN,
  "telegram.chatId": process.env.TELEGRAM_CHAT_ID,
  "x.bearerToken": process.env.X_BEARER_TOKEN,
  "openai.apiKey": process.env.OPENAI_API_KEY
};

export type AppSettings = {
  geminiApiKey: string | null;
  geminiModel: string;
  basePrompt: string;
  publishThreshold: number;
  telegramThreshold: number;
  outputLanguage: string;
  updateFrequencyHours: number;
  maxSourcesPerRun: number;
  timezone: string;
  jobSchedules: JobSchedules;
  jobSchedulesEnabled: boolean;
  telegramEnabled: boolean;
  telegramDeliveryMode: TelegramDeliveryMode;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramTemplate: string;
  video: VideoSettings;
  xBearerToken: string | null;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiEnabled: boolean;
};

export type TelegramDeliveryMode = "legacy_individual" | "video_digest_manual";

export type VideoSettings = {
  enabled: boolean;
  maxNewsItems: number;
  maxOpenDigests: number;
  targetDurationSeconds: number;
  width: number;
  height: number;
  fps: number;
  language: string;
  ttsProvider: "gemini" | "mock";
  ttsModel: string;
  ttsVoice: string;
  subtitlesEnabled: boolean;
  outputDirectory: string;
  keepTempFiles: boolean;
  retentionDays: number;
  failedRetentionDays: number;
};

export type ScheduleFrequency = "hourly" | "daily" | "weekly";

export type JobScheduleConfig = {
  frequency: ScheduleFrequency;
  time: string;
  weekday: string;
};

export type JobSchedules = {
  collect: JobScheduleConfig;
  process: JobScheduleConfig;
  telegram: JobScheduleConfig;
};

export type JobScheduleKey = keyof JobSchedules;

const scheduleSettingKeys: Record<JobScheduleKey, string[]> = {
  collect: ["jobs.collectFrequency", "jobs.collectTime", "jobs.collectWeekday"],
  process: ["jobs.processFrequency", "jobs.processTime", "jobs.processWeekday"],
  telegram: ["jobs.telegramFrequency", "jobs.telegramTime", "jobs.telegramWeekday"]
};

export class SettingsService {
  static async getRaw(key: string) {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (!row?.value) return defaults[key as keyof typeof defaults] ?? envFallbacks[key] ?? null;
    return row.isSecret ? decryptSecret(row.value) : row.value;
  }

  static async getString(key: string, fallback = "") {
    return (await this.getRaw(key)) ?? fallback;
  }

  static async getNumber(key: string, fallback: number) {
    const raw = await this.getRaw(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  static async getBoolean(key: string, fallback = false) {
    const raw = await this.getRaw(key);
    if (raw === null) return fallback;
    return raw === "true" || raw === "1" || raw === "on";
  }

  static async set(key: string, value: string | null, isSecret = false) {
    const stored = isSecret && value ? encryptSecret(value) : value;
    await prisma.setting.upsert({
      where: { key },
      update: { value: stored, isSecret },
      create: { key, value: stored, isSecret }
    });
  }

  static async hasSecret(key: string) {
    const dbValue = await prisma.setting.findUnique({ where: { key } });
    return Boolean(dbValue?.value || envFallbacks[key]);
  }

  static async getAll(): Promise<AppSettings> {
    return {
      geminiApiKey: await this.getRaw("gemini.apiKey"),
      geminiModel: await this.getString("gemini.model", "gemini-3.5-flash"),
      basePrompt: await this.getString("analysis.basePrompt", DEFAULT_NEWS_ANALYSIS_PROMPT),
      publishThreshold: await this.getNumber("news.publishThreshold", 70),
      telegramThreshold: await this.getNumber("news.telegramThreshold", 82),
      outputLanguage: await this.getString("app.outputLanguage", "es"),
      updateFrequencyHours: await this.getNumber("jobs.updateFrequencyHours", 6),
      maxSourcesPerRun: await this.getNumber("jobs.maxSourcesPerRun", 12),
      timezone: await this.getString("jobs.timezone", "Europe/Madrid"),
      jobSchedules: await this.getJobSchedules(),
      jobSchedulesEnabled: await this.getBoolean("jobs.schedulesEnabled", true),
      telegramEnabled: await this.getBoolean("telegram.enabled", false),
      telegramDeliveryMode: (await this.getString("telegram.deliveryMode", "legacy_individual")) as TelegramDeliveryMode,
      telegramBotToken: await this.getRaw("telegram.botToken"),
      telegramChatId: await this.getRaw("telegram.chatId"),
      telegramTemplate: await this.getString("telegram.messageTemplate", DEFAULT_TELEGRAM_TEMPLATE),
      video: await this.getVideoSettings(),
      xBearerToken: await this.getRaw("x.bearerToken"),
      openaiApiKey: await this.getRaw("openai.apiKey"),
      openaiModel: await this.getString("openai.model", ""),
      openaiEnabled: await this.getBoolean("openai.enabled", false)
    };
  }

  static async getVideoSettings(): Promise<VideoSettings> {
    return {
      enabled: await this.getBoolean("video.enabled", false),
      maxNewsItems: await this.getNumber("video.maxNewsItems", 6),
      maxOpenDigests: await this.getNumber("video.maxOpenDigests", 1),
      targetDurationSeconds: await this.getNumber("video.targetDurationSeconds", 150),
      width: await this.getNumber("video.width", 1920),
      height: await this.getNumber("video.height", 1080),
      fps: await this.getNumber("video.fps", 30),
      language: await this.getString("video.language", "es-ES"),
      ttsProvider: (await this.getString("video.ttsProvider", "gemini")) as VideoSettings["ttsProvider"],
      ttsModel: await this.getString("video.ttsModel", "gemini-3.1-flash-tts-preview"),
      ttsVoice: await this.getString("video.ttsVoice", "Kore"),
      subtitlesEnabled: await this.getBoolean("video.subtitlesEnabled", true),
      outputDirectory: await this.getString("video.outputDirectory", "./data/video-digests"),
      keepTempFiles: await this.getBoolean("video.keepTempFiles", false),
      retentionDays: await this.getNumber("video.retentionDays", 7),
      failedRetentionDays: await this.getNumber("video.failedRetentionDays", 2)
    };
  }

  static async getJobSchedules(): Promise<JobSchedules> {
    return {
      collect: {
        frequency: (await this.getString("jobs.collectFrequency", "daily")) as ScheduleFrequency,
        time: await this.getString("jobs.collectTime", "03:00"),
        weekday: await this.getString("jobs.collectWeekday", "monday")
      },
      process: {
        frequency: (await this.getString("jobs.processFrequency", "daily")) as ScheduleFrequency,
        time: await this.getString("jobs.processTime", "03:30"),
        weekday: await this.getString("jobs.processWeekday", "monday")
      },
      telegram: {
        frequency: (await this.getString("jobs.telegramFrequency", "daily")) as ScheduleFrequency,
        time: await this.getString("jobs.telegramTime", "04:00"),
        weekday: await this.getString("jobs.telegramWeekday", "monday")
      }
    };
  }

  static async getJobScheduleSavedStates() {
    const entries = await Promise.all(
      (Object.keys(scheduleSettingKeys) as JobScheduleKey[]).map(async (key) => {
        const settings = await prisma.setting.findMany({
          where: { key: { in: scheduleSettingKeys[key] } },
          select: { key: true, value: true, updatedAt: true }
        });
        const values = new Map(settings.map((setting) => [setting.key, setting]));
        const saved = scheduleSettingKeys[key].every((settingKey) => Boolean(values.get(settingKey)?.value));
        const savedAt = saved
          ? settings.reduce<Date | null>((latest, setting) => {
              if (!latest || setting.updatedAt > latest) return setting.updatedAt;
              return latest;
            }, null)
          : null;

        return [key, { saved, savedAt }] as const;
      })
    );

    return Object.fromEntries(entries) as Record<JobScheduleKey, { saved: boolean; savedAt: Date | null }>;
  }

  static async hasJobSchedule(key: JobScheduleKey) {
    const states = await this.getJobScheduleSavedStates();
    return states[key].saved;
  }
}
