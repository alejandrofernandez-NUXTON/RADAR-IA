import { Prisma, NewsStatus, TelegramStatus, VideoDigestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SettingsService } from "@/lib/services/settings-service";
import { VideoDigestError } from "@/video/errors";
import { createNewsSnapshot, digestInputHash, sourceRevisionHash } from "@/video/schemas/news-snapshot-schema";
import { OPEN_VIDEO_DIGEST_STATUSES } from "@/video/state-machine";

export function pendingTelegramWhere(telegramThreshold: number): Prisma.NewsItemWhereInput {
  return {
    status: NewsStatus.PUBLISHED,
    telegramWorthy: true,
    overallScore: { gte: telegramThreshold },
    sentToTelegramAt: null,
    videoDigestReservationId: null,
    telegramMessages: { none: { status: TelegramStatus.SENT } }
  };
}

export const pendingTelegramOrder: Prisma.NewsItemOrderByWithRelationInput[] = [
  { createdAt: "asc" },
  { overallScore: "desc" },
  { id: "asc" }
];

export class TelegramPendingNewsService {
  async countEligibleNews() {
    const settings = await SettingsService.getAll();
    return prisma.newsItem.count({ where: pendingTelegramWhere(settings.telegramThreshold) });
  }

  async listEligibleNews(take = 100) {
    const settings = await SettingsService.getAll();
    return prisma.newsItem.findMany({
      where: pendingTelegramWhere(settings.telegramThreshold),
      include: { source: true },
      orderBy: pendingTelegramOrder,
      take
    });
  }

  async isNewsReservedForVideo(newsItemId: string) {
    const item = await prisma.newsItem.findUnique({
      where: { id: newsItemId },
      select: { videoDigestReservationId: true }
    });
    return item?.videoDigestReservationId || null;
  }

  async claimEligibleNewsForDigest() {
    const settings = await SettingsService.getAll();
    const maxItems = Math.max(1, Math.min(12, settings.video.maxNewsItems));
    const maxOpenDigests = Math.max(1, Math.min(5, settings.video.maxOpenDigests));

    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nuxton_video_digest_selection'))`;

        const openDigests = await tx.videoDigest.findMany({
          where: { status: { in: OPEN_VIDEO_DIGEST_STATUSES } },
          orderBy: { createdAt: "asc" },
          take: maxOpenDigests
        });
        if (openDigests.length >= maxOpenDigests) {
          return { kind: "existing" as const, digest: openDigests[0] };
        }

        const candidates = await tx.newsItem.findMany({
          where: pendingTelegramWhere(settings.telegramThreshold),
          include: { source: true },
          orderBy: pendingTelegramOrder,
          take: maxItems
        });
        if (!candidates.length) return { kind: "empty" as const };

        const remainingCount = await tx.newsItem.count({
          where: pendingTelegramWhere(settings.telegramThreshold)
        });
        const digest = await tx.videoDigest.create({
          data: {
            status: VideoDigestStatus.QUEUED,
            language: settings.video.language,
            targetDurationSeconds: settings.video.targetDurationSeconds,
            inputHash: "pending"
          }
        });

        const claimed = await tx.newsItem.updateMany({
          where: {
            id: { in: candidates.map((item) => item.id) },
            ...pendingTelegramWhere(settings.telegramThreshold)
          },
          data: { videoDigestReservationId: digest.id }
        });
        if (claimed.count !== candidates.length) {
          throw new VideoDigestError(
            "NEWS_ALREADY_RESERVED",
            "Otra ejecucion ha reservado una de las noticias. Vuelve a intentarlo."
          );
        }

        const reserved = await tx.newsItem.findMany({
          where: { videoDigestReservationId: digest.id },
          include: { source: true },
          orderBy: pendingTelegramOrder
        });
        const snapshots = reserved.map((item) => createNewsSnapshot(item));
        const hashes = snapshots.map(sourceRevisionHash);
        const inputHash = digestInputHash(hashes);

        await tx.videoDigestItem.createMany({
          data: snapshots.map((snapshot, index) => ({
            videoDigestId: digest.id,
            newsItemId: snapshot.newsItemId,
            position: index + 1,
            contentSnapshot: snapshot as Prisma.InputJsonValue,
            sourceRevisionHash: hashes[index]
          }))
        });
        const updated = await tx.videoDigest.update({
          where: { id: digest.id },
          data: { inputHash }
        });

        return {
          kind: "claimed" as const,
          digest: updated,
          snapshots,
          remainingCount: Math.max(0, remainingCount - snapshots.length)
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 }
    );
  }

  async releaseDigestReservations(videoDigestId: string) {
    return prisma.newsItem.updateMany({
      where: { videoDigestReservationId: videoDigestId },
      data: { videoDigestReservationId: null }
    });
  }

  async assertDigestStillSendable(videoDigestId: string) {
    const digest = await prisma.videoDigest.findUnique({
      where: { id: videoDigestId },
      include: {
        items: {
          include: {
            newsItem: {
              include: {
                source: true,
                telegramMessages: { where: { status: TelegramStatus.SENT }, select: { id: true } }
              }
            }
          },
          orderBy: { position: "asc" }
        }
      }
    });
    if (!digest) throw new VideoDigestError("VIDEO_DIGEST_NOT_FOUND", "El video solicitado no existe.");
    if (!digest.items.length) {
      throw new VideoDigestError("VIDEO_DIGEST_INTEGRITY_ERROR", "El video no contiene noticias.");
    }

    const currentHashes: string[] = [];
    for (const item of digest.items) {
      const news = item.newsItem;
      if (
        !news ||
        news.status !== NewsStatus.PUBLISHED ||
        news.sentToTelegramAt ||
        news.videoDigestReservationId !== digest.id ||
        news.telegramMessages.length > 0
      ) {
        throw new VideoDigestError(
          "NEWS_NO_LONGER_ELIGIBLE",
          "Una de las noticias ya no esta publicada, ha sido enviada o ha perdido su reserva."
        );
      }
      const hash = sourceRevisionHash(createNewsSnapshot(news));
      if (hash !== item.sourceRevisionHash) {
        throw new VideoDigestError(
          "VIDEO_DIGEST_STALE",
          "El contenido de una noticia ha cambiado. Regenera el video antes de enviarlo."
        );
      }
      currentHashes.push(hash);
    }

    if (digestInputHash(currentHashes) !== digest.inputHash) {
      throw new VideoDigestError(
        "VIDEO_DIGEST_STALE",
        "El conjunto de noticias ha cambiado. Regenera el video antes de enviarlo."
      );
    }
    return digest;
  }
}
