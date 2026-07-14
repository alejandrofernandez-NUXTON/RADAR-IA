import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { streamJob } from "@/lib/job-stream";
import { JobService } from "@/lib/services/job-service";

export const runtime = "nodejs";
export const maxDuration = 900;

const idSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const { id } = await context.params;
  const videoDigestId = idSchema.parse(id);
  if (request.nextUrl.searchParams.get("stream") === "1") {
    return streamJob((progress) => new JobService().runVideoRegenerationJob(videoDigestId, progress));
  }
  return NextResponse.json(await new JobService().runVideoRegenerationJob(videoDigestId));
}
