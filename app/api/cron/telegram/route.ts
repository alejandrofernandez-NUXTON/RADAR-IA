import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobService } from "@/lib/services/job-service";
import { ScheduleService } from "@/lib/services/schedule-service";
import { SettingsService } from "@/lib/services/settings-service";
import { LogService } from "@/lib/services/log-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const settings = await SettingsService.getAll();
  if (settings.telegramDeliveryMode === "video_digest_manual") {
    await LogService.info("telegram.cron", "Cron omitido: el modo activo requiere generar y enviar el video manualmente.");
    return NextResponse.json({ ran: 0, skipped: true, reason: "video_digest_manual" });
  }
  if (!(await ScheduleService.shouldRun("telegram", "telegram_send_pending"))) {
    return NextResponse.json({ ran: 0, skipped: true, reason: "Telegram no esta programado para ejecutarse en esta franja." });
  }
  const job = await new JobService().runTelegramPendingJob();
  return NextResponse.json({ ran: 1, skipped: false, job });
}
