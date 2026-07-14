import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobCancellationService } from "@/lib/services/job-cancellation-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const result = JobCancellationService.cancelAll();
  return NextResponse.json(result);
}
