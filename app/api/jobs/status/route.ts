import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { JobRuntimeService } from "@/lib/services/job-runtime-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  return NextResponse.json({ jobs: JobRuntimeService.list() });
}
