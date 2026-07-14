export const JOB_ENDPOINTS = {
  sourceCollection: "/api/jobs/sources/collect",
  newsProcessing: "/api/jobs/news/process",
  trainingSearch: "/api/jobs/training/run",
  telegramPending: "/api/jobs/telegram/send-pending",
  videoGenerate: "/api/jobs/video/generate-pending"
} as const;
