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
  "telegram.enabled": "false",
  "telegram.messageTemplate": DEFAULT_TELEGRAM_TEMPLATE,
  "openai.enabled": "false",
  "openai.model": process.env.OPENAI_MODEL || ""
} as const;

const envFallbacks: Record<string, string | undefined> = {
  "gemini.apiKey": process.env.GEMINI_API_KEY,
  "telegram.botToken": process.env.TELEGRAM_BOT_TOKEN,
  "telegram.chatId": process.env.TELEGRAM_CHAT_ID,
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
  telegramEnabled: boolean;
  telegramBotToken: string | null;
  telegramChatId: string | null;
  telegramTemplate: string;
  openaiApiKey: string | null;
  openaiModel: string;
  openaiEnabled: boolean;
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
      telegramEnabled: await this.getBoolean("telegram.enabled", false),
      telegramBotToken: await this.getRaw("telegram.botToken"),
      telegramChatId: await this.getRaw("telegram.chatId"),
      telegramTemplate: await this.getString("telegram.messageTemplate", DEFAULT_TELEGRAM_TEMPLATE),
      openaiApiKey: await this.getRaw("openai.apiKey"),
      openaiModel: await this.getString("openai.model", ""),
      openaiEnabled: await this.getBoolean("openai.enabled", false)
    };
  }
}
