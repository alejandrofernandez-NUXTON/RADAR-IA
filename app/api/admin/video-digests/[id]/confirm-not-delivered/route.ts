import { NextResponse, type NextRequest } from "next/server";
import { VideoDigestStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/server-auth";
import { LogService } from "@/lib/services/log-service";

export const runtime = "nodejs";
const idSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  const updated = await prisma.videoDigest.updateMany({
    where: { id: parsed.data, status: VideoDigestStatus.SEND_FAILED, deliveryUncertain: true },
    data: { deliveryUncertain: false, errorCode: null, errorMessage: null }
  });
  if (updated.count !== 1) return NextResponse.json({ error: "El video no tiene un envio incierto pendiente." }, { status: 409 });
  await LogService.warn("video.send.reconciled", "El administrador confirmo que el video no llego a Telegram.", {
    videoDigestId: parsed.data,
    adminEmail: session.email
  });
  return NextResponse.json({ updated: true });
}
