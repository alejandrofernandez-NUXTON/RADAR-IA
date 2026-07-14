import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { streamJob } from "@/lib/job-stream";
import { JobService } from "@/lib/services/job-service";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  if (request.nextUrl.searchParams.get("stream") === "1") {
    return streamJob((progress) => new JobService().runVideoGenerationJob(progress));
  }
  return NextResponse.json(await new JobService().runVideoGenerationJob());
}
