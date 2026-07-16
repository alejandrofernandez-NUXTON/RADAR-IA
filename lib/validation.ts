import { z } from "zod";

const score = z.number().int().min(0).max(100);

export const newsAnalysisSchema = z.object({
  title: z.string().min(1),
  shortSummary: z.string().min(1),
  longSummary: z.string().min(1),
  keyPoints: z.array(z.string()),
  whyItMatters: z.string().min(1),
  businessApplications: z.array(z.string()),
  toolsMentioned: z.array(z.string()),
  companiesMentioned: z.array(z.string()),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  noveltyScore: score,
  relevanceScore: score,
  practicalityScore: score,
  urgencyScore: score,
  overallScore: score,
  recommendedAction: z.enum(["publish", "review", "discard"]),
  telegramWorthy: z.boolean(),
  telegramMessage: z.string(),
  sourceReliability: z.enum(["low", "medium", "high"]),
  detectedLanguage: z.string()
});

export type NewsAnalysis = z.infer<typeof newsAnalysisSchema>;

export const trainingEvaluationSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  url: z.string().url(),
  provider: z.string().min(1),
  contentType: z.enum(["video", "course", "tutorial", "playlist", "article", "documentation"]),
  estimatedDuration: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  topics: z.array(z.string()),
  qualityScore: score,
  practicalityScore: score,
  freshnessScore: score,
  overallScore: score,
  whyRecommended: z.string().min(1),
  isFree: z.boolean(),
  language: z.string()
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
  basePrompt: z.string().min(50),
  publishThreshold: z.coerce.number().int().min(0).max(100),
  telegramThreshold: z.coerce.number().int().min(0).max(100),
  outputLanguage: z.string().min(2).max(24),
  updateFrequencyHours: z.coerce.number().int().min(1).max(168),
  maxSourcesPerRun: z.coerce.number().int().min(1).max(100),
  telegramEnabled: z.coerce.boolean().default(false),
  telegramDeliveryMode: z.enum(["legacy_individual", "video_digest_manual"]).default("legacy_individual"),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
  telegramTemplate: z.string().min(20),
  videoEnabled: z.coerce.boolean().default(false),
  videoAutoGenerateAfterProcessing: z.coerce.boolean().default(false),
  videoAutoSendOnSchedule: z.coerce.boolean().default(false),
  videoMaxNewsItems: z.coerce.number().int().min(1).max(12),
  videoMaxOpenDigests: z.coerce.number().int().min(1).max(5),
  videoTargetDurationSeconds: z.coerce.number().int().min(30).max(900),
  videoWidth: z.coerce.number().int().min(640).max(3840),
  videoHeight: z.coerce.number().int().min(360).max(2160),
  videoFps: z.coerce.number().int().min(15).max(60),
  videoLanguage: z.string().min(2).max(24),
  videoTtsProvider: z.enum(["openai", "mock"]),
  videoTtsModel: z.string().min(2).max(120),
  videoTtsVoice: z.string().min(2).max(80),
  videoSubtitlesEnabled: z.coerce.boolean().default(false),
  videoOutputDirectory: z
    .string()
    .min(3)
    .max(240)
    .refine((value) => !value.includes("..") && !/^[\\/]/.test(value) && !/^[A-Za-z]:/.test(value), "La ruta debe ser relativa y no puede contener '..'."),
  videoKeepTempFiles: z.coerce.boolean().default(false),
  videoRetentionDays: z.coerce.number().int().min(1).max(365),
  videoFailedRetentionDays: z.coerce.number().int().min(1).max(90),
  xBearerToken: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().min(2).max(120).default("gpt-5.6-terra"),
  openaiTranscriptionModel: z.string().min(2).max(120).default("gpt-4o-transcribe"),
  openaiReasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh", "max"]).default("low"),
  openaiVisionEnabled: z.coerce.boolean().default(true),
  openaiEnabled: z.coerce.boolean().default(true)
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
