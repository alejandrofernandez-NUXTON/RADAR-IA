import { z } from "zod";

const score = z.coerce.number().min(0).max(100).transform((value) => Math.round(value));

export const geminiNewsSchema = z.object({
  title: z.string().min(1),
  shortSummary: z.string().min(1),
  longSummary: z.string().min(1),
  keyPoints: z.array(z.string()).default([]),
  whyItMatters: z.string().min(1),
  businessApplications: z.array(z.string()).default([]),
  toolsMentioned: z.array(z.string()).default([]),
  companiesMentioned: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  noveltyScore: score,
  relevanceScore: score,
  practicalityScore: score,
  urgencyScore: score,
  overallScore: score,
  recommendedAction: z.enum(["publish", "review", "discard"]),
  telegramWorthy: z.boolean(),
  telegramMessage: z.string().default(""),
  sourceReliability: z.enum(["low", "medium", "high"]),
  detectedLanguage: z.string().default("es")
});

export type GeminiNewsAnalysis = z.infer<typeof geminiNewsSchema>;

export const trainingEvaluationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  provider: z.string().min(1),
  contentType: z.enum(["video", "course", "tutorial", "playlist", "article", "documentation"]),
  estimatedDuration: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  topics: z.array(z.string()).default([]),
  qualityScore: score,
  practicalityScore: score,
  freshnessScore: score,
  overallScore: score,
  whyRecommended: z.string().min(1),
  isFree: z.boolean(),
  language: z.string().default("es")
});

export type TrainingEvaluation = z.infer<typeof trainingEvaluationSchema>;

export const sourceInputSchema = z.object({
  name: z.string().min(2).max(140),
  type: z.enum([
    "YOUTUBE_VIDEO",
    "YOUTUBE_CHANNEL",
    "YOUTUBE_PLAYLIST",
    "TWITTER_CHANNEL",
    "TIKTOK_CHANNEL",
    "INSTAGRAM_CHANNEL"
  ]),
  url: z.string().url(),
  category: z.string().min(2).max(80),
  language: z.string().min(2).max(12).default("es"),
  priority: z.coerce.number().int().min(1).max(10).default(1),
  active: z.coerce.boolean().default(true),
  notes: z.string().max(1000).optional()
});

export const settingsInputSchema = z.object({
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().min(2).default("gemini-3.5-flash"),
  basePrompt: z.string().min(50),
  publishThreshold: z.coerce.number().int().min(0).max(100),
  telegramThreshold: z.coerce.number().int().min(0).max(100),
  outputLanguage: z.string().min(2).max(24),
  updateFrequencyHours: z.coerce.number().int().min(1).max(168),
  maxSourcesPerRun: z.coerce.number().int().min(1).max(100),
  telegramEnabled: z.coerce.boolean().default(false),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  telegramTemplate: z.string().min(20),
  xBearerToken: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  openaiEnabled: z.coerce.boolean().default(false)
});

const scheduleFrequency = z.enum(["hourly", "daily", "weekly"]);
const scheduleTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const scheduleWeekday = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);

export const jobSchedulesInputSchema = z.object({
  collectFrequency: scheduleFrequency,
  collectTime: scheduleTime,
  collectWeekday: scheduleWeekday,
  processFrequency: scheduleFrequency,
  processTime: scheduleTime,
  processWeekday: scheduleWeekday,
  telegramFrequency: scheduleFrequency,
  telegramTime: scheduleTime,
  telegramWeekday: scheduleWeekday
});
