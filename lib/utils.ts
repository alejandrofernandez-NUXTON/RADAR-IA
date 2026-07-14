import type { NewsStatus, TelegramStatus, TrainingStatus } from "@prisma/client";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function formatDate(value?: Date | string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function scoreTone(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  if (score >= 50) return "low";
  return "muted";
}

export function compactUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function statusLabel(status: NewsStatus | TrainingStatus | TelegramStatus | string) {
  const labels: Record<string, string> = {
    DRAFT: "Borrador",
    REVIEW: "Pendiente",
    PUBLISHED: "Publicado",
    DISCARDED: "Descartado",
    SENT_TO_TELEGRAM: "Enviado a Telegram",
    ERROR: "Error",
    FEATURED: "Destacado",
    PENDING: "Pendiente",
    SENT: "Enviado",
    FAILED: "Fallido",
    QUEUED: "En cola",
    GENERATING: "Generando",
    READY: "Listo para revision",
    SENDING: "Enviando",
    GENERATION_FAILED: "Error de generacion",
    SEND_FAILED: "Error de envio",
    CANCELLED: "Cancelado"
  };

  return labels[status] ?? status.toLowerCase().replaceAll("_", " ");
}

export function clampScore(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function truncate(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}
