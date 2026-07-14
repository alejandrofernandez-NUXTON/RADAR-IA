import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { getCurrentSession } from "@/lib/server-auth";
import { VideoDigestService } from "@/lib/services/video-digest-service";

export const runtime = "nodejs";
export const maxDuration = 900;
const idSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRateLimited(`video-send:${session.email}`, 5, 60_000)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera un minuto." }, { status: 429 });
  }
  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  try {
    return NextResponse.json(await new VideoDigestService().sendDigestToTelegram(parsed.data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo enviar el video." }, { status: 409 });
  }
}
