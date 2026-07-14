import "dotenv/config";
import { PrismaClient, SourceType } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { DEFAULT_NEWS_ANALYSIS_PROMPT, DEFAULT_TELEGRAM_TEMPLATE } from "../lib/prompts";
import { encryptSecret } from "../lib/secret-crypto";

const prisma = new PrismaClient();

async function upsertSetting(key: string, value: string | null, isSecret = false) {
  await prisma.setting.upsert({
    where: { key },
    update: { value, isSecret },
    create: { key, value, isSecret }
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin";
  const password = process.env.ADMIN_PASSWORD || "78202412";

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashPassword(password),
      role: "admin"
    },
    create: {
      email,
      passwordHash: hashPassword(password),
      role: "admin"
    }
  });

  await upsertSetting("gemini.model", process.env.GEMINI_MODEL || "gemini-3.5-flash");
  await upsertSetting("analysis.basePrompt", DEFAULT_NEWS_ANALYSIS_PROMPT);
  await upsertSetting("news.publishThreshold", "70");
  await upsertSetting("news.telegramThreshold", "82");
  await upsertSetting("app.outputLanguage", "es");
  await upsertSetting("jobs.updateFrequencyHours", "6");
  await upsertSetting("jobs.maxSourcesPerRun", "12");
  await upsertSetting("jobs.timezone", "Europe/Madrid");
  await upsertSetting("jobs.collectFrequency", "daily");
  await upsertSetting("jobs.collectTime", "03:00");
  await upsertSetting("jobs.collectWeekday", "monday");
  await upsertSetting("jobs.processFrequency", "daily");
  await upsertSetting("jobs.processTime", "03:30");
  await upsertSetting("jobs.processWeekday", "monday");
  await upsertSetting("jobs.telegramFrequency", "daily");
  await upsertSetting("jobs.telegramTime", "04:00");
  await upsertSetting("jobs.telegramWeekday", "monday");
  await upsertSetting("telegram.enabled", "false");
  await upsertSetting("telegram.messageTemplate", DEFAULT_TELEGRAM_TEMPLATE);
  await upsertSetting("openai.enabled", "false");
  await upsertSetting("openai.model", process.env.OPENAI_MODEL || "");

  if (process.env.GEMINI_API_KEY) {
    await upsertSetting("gemini.apiKey", encryptSecret(process.env.GEMINI_API_KEY), true);
  }
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await upsertSetting("telegram.botToken", encryptSecret(process.env.TELEGRAM_BOT_TOKEN), true);
  }
  if (process.env.TELEGRAM_CHAT_ID) {
    await upsertSetting("telegram.chatId", encryptSecret(process.env.TELEGRAM_CHAT_ID), true);
  }
  if (process.env.OPENAI_API_KEY) {
    await upsertSetting("openai.apiKey", encryptSecret(process.env.OPENAI_API_KEY), true);
  }

  await prisma.source.createMany({
    data: [
      {
        name: "Google AI Developers",
        type: SourceType.YOUTUBE_CHANNEL,
        url: "https://www.youtube.com/@GoogleAIDevelopers",
        category: "modelos-y-herramientas",
        language: "en",
        priority: 7,
        active: false,
        notes: "Ejemplo inactivo. La primera version prioriza videos concretos y playlists; canales completos quedan preparados."
      },
      {
        name: "Hugging Face Blog",
        type: SourceType.RSS_FEED,
        url: "https://huggingface.co/blog/feed.xml",
        category: "open-source-ai",
        language: "en",
        priority: 6,
        active: false,
        notes: "Ejemplo de RSS para activar cuando se quiera probar fuentes no YouTube."
      },
      {
        name: "Microsoft Learn AI",
        type: SourceType.WEBSITE,
        url: "https://learn.microsoft.com/training/ai/",
        category: "formacion",
        language: "en",
        priority: 5,
        active: false,
        notes: "Ejemplo de fuente web institucional."
      }
    ],
    skipDuplicates: true
  });

  console.log(`Seed completado. Admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
