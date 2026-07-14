import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobService } from "@/lib/services/job-service";
import { ScheduleService } from "@/lib/services/schedule-service";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const service = new JobService();
  const jobs = [];

  if (await ScheduleService.shouldRun("collect", "source_collection")) {
    jobs.push(await service.runSourceCollectionJob());
  }

  if (await ScheduleService.shouldRun("process", "news_processing")) {
    jobs.push(await service.runNewsProcessingJob());
  }

  return NextResponse.json({
    ran: jobs.length,
    skipped: jobs.length === 0,
    jobs
  });
}
