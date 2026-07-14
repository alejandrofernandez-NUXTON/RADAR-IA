import type { TelegramDeliveryMode } from "@/lib/services/settings-service";

type VideoAutomationSettings = {
  deliveryMode: TelegramDeliveryMode;
  videoEnabled: boolean;
  autoGenerateAfterProcessing: boolean;
  autoSendOnSchedule: boolean;
};

export function shouldAutoGenerateVideo(settings: VideoAutomationSettings) {
  return (
    settings.deliveryMode === "video_digest_manual" &&
    settings.videoEnabled &&
    settings.autoGenerateAfterProcessing
  );
}

export function shouldAutoSendReadyVideo(settings: VideoAutomationSettings) {
  return (
    settings.deliveryMode === "video_digest_manual" &&
    settings.videoEnabled &&
    settings.autoSendOnSchedule
  );
}
