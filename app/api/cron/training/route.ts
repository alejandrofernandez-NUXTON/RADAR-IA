import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobService } from "@/lib/services/job-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const job = await new JobService().runTrainingJob();
  return NextResponse.json(job);
}
