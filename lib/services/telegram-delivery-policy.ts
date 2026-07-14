import { NewsStatus } from "@prisma/client";
import type { TelegramDeliveryMode } from "@/lib/services/settings-service";

export function shouldAutoSendIndividual(input: {
  telegramEnabled: boolean;
  deliveryMode: TelegramDeliveryMode;
  status: NewsStatus;
  telegramWorthy: boolean;
  overallScore: number;
  telegramThreshold: number;
}) {
  return (
    input.telegramEnabled &&
    input.deliveryMode === "legacy_individual" &&
    input.status === NewsStatus.PUBLISHED &&
    input.telegramWorthy &&
    input.overallScore >= input.telegramThreshold
  );
}

export function individualDeliveryBlockedByReservation(videoDigestReservationId?: string | null) {
  return Boolean(videoDigestReservationId);
}
