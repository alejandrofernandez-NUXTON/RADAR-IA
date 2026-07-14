import { createReadStream } from "fs";
import { Readable } from "stream";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/server-auth";
import { LocalVideoStorageProvider } from "@/video/services/video-storage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/);
const artifactSchema = z.enum(["video", "thumbnail", "subtitles"]).default("video");

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsedId = idSchema.safeParse(id);
  const artifact = artifactSchema.safeParse(request.nextUrl.searchParams.get("artifact") || "video");
  if (!parsedId.success || !artifact.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const digest = await prisma.videoDigest.findUnique({
    where: { id: parsedId.data },
    select: { videoStorageKey: true, thumbnailStorageKey: true, subtitleStorageKey: true }
  });
  const storageKey =
    artifact.data === "thumbnail"
      ? digest?.thumbnailStorageKey
      : artifact.data === "subtitles"
        ? digest?.subtitleStorageKey
        : digest?.videoStorageKey;
  if (!storageKey) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  try {
    const storage = await LocalVideoStorageProvider.create();
    const file = await storage.open(storageKey);
    const mimeType = artifact.data === "thumbnail" ? "image/jpeg" : artifact.data === "subtitles" ? "application/x-subrip" : "video/mp4";
    const range = request.headers.get("range");
    if (!range) {
      const stream = createReadStream(file.absolutePath);
      return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(file.size),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline"
        }
      });
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= file.size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    const stream = createReadStream(file.absolutePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${file.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
}
