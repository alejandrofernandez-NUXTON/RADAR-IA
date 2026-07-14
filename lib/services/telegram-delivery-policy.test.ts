import { describe, expect, it } from "vitest";
import { NewsStatus } from "@prisma/client";
import { individualDeliveryBlockedByReservation, shouldAutoSendIndividual } from "@/lib/services/telegram-delivery-policy";

const eligible = {
  telegramEnabled: true,
  deliveryMode: "legacy_individual" as const,
  status: NewsStatus.PUBLISHED,
  telegramWorthy: true,
  overallScore: 90,
  telegramThreshold: 82
};

describe("Telegram delivery modes", () => {
  it("preserves automatic individual delivery in legacy mode", () => {
    expect(shouldAutoSendIndividual(eligible)).toBe(true);
  });

  it("blocks automatic individual delivery in manual video mode", () => {
    expect(shouldAutoSendIndividual({ ...eligible, deliveryMode: "video_digest_manual" })).toBe(false);
  });

  it("still respects the global Telegram switch", () => {
    expect(shouldAutoSendIndividual({ ...eligible, telegramEnabled: false })).toBe(false);
  });

  it("does not send REVIEW news", () => {
    expect(shouldAutoSendIndividual({ ...eligible, status: NewsStatus.REVIEW })).toBe(false);
  });

  it("does not send below the configured threshold", () => {
    expect(shouldAutoSendIndividual({ ...eligible, overallScore: 81 })).toBe(false);
  });

  it("blocks individual delivery while a video owns the reservation", () => {
    expect(individualDeliveryBlockedByReservation("digest-1")).toBe(true);
    expect(individualDeliveryBlockedByReservation(null)).toBe(false);
  });
});
