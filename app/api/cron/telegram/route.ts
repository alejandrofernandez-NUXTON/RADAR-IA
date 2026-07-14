import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobService } from "@/lib/services/job-service";
import { ScheduleService } from "@/lib/services/schedule-service";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  if (!(await ScheduleService.shouldRun("telegram", "telegram_send_pending"))) {
    return NextResponse.json({ ran: 0, skipped: true, reason: "Telegram no esta programado para ejecutarse en esta franja." });
  }
  const job = await new JobService().runTelegramPendingJob(undefined, { scheduled: true });
  return NextResponse.json({ ran: 1, skipped: false, job });
}
