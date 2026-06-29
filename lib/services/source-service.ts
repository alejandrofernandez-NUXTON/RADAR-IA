import { SourceType, type Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { YouTubeService } from "@/lib/services/youtube-service";
import type { SourceContent } from "@/lib/types";

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, " ")) : "";
}

export class SourceService {
  private youtube = new YouTubeService();

  async getActiveSources(limit: number) {
    return prisma.source.findMany({
      where: { active: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: limit
    });
  }

  async fetchContentsForSource(sourceId: string, maxItems = 5) {
    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error("Source not found.");
    return this.fetchContents(source, maxItems);
  }

  async fetchContents(source: Source | null, maxItems = 5): Promise<SourceContent[]> {
    if (!source) return [];

    if (source.type === SourceType.YOUTUBE_VIDEO) {
      return [await this.youtube.getVideoContent(source, source.url)];
    }

    if (source.type === SourceType.YOUTUBE_PLAYLIST) {
      return this.youtube.getPlaylistContents(source, maxItems);
    }

    if (source.type === SourceType.YOUTUBE_CHANNEL) {
      return this.youtube.getChannelContents(source, maxItems);
    }

    if (source.type === SourceType.RSS_FEED) {
      return this.fetchRss(source, maxItems);
    }

    if (source.type === SourceType.WEBSITE) {
      return [await this.fetchWebsite(source)];
    }

    return [
      {
        source,
        sourceUrl: source.url,
        title: source.name,
        description: source.notes || "Fuente preparada para incorporacion futura.",
        rawMetadata: { unsupportedType: source.type }
      }
    ];
  }

  async markProcessed(sourceId: string) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastProcessedAt: new Date() }
    });
  }

  private async fetchRss(source: Source, maxItems: number) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`RSS fetch failed with status ${response.status}`);
    const xml = await response.text();
    const items = [...xml.matchAll(/<(item|entry)[^>]*>([\s\S]*?)<\/\1>/gi)].slice(0, maxItems);

    return items.map(([, , item]) => {
      const link = tagValue(item, "link") || item.match(/<link[^>]+href="([^"]+)"/i)?.[1] || source.url;
      const title = tagValue(item, "title") || source.name;
      const description = tagValue(item, "description") || tagValue(item, "summary") || tagValue(item, "content");
      const published = tagValue(item, "pubDate") || tagValue(item, "published") || tagValue(item, "updated");

      return {
        source,
        sourceUrl: link,
        title,
        description,
        publishedAt: published ? new Date(published) : undefined,
        rawMetadata: { feedUrl: source.url }
      };
    });
  }

  private async fetchWebsite(source: Source) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Website fetch failed with status ${response.status}`);
    const html = await response.text();
    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
      source.name;
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      source.notes ||
      "";

    return {
      source,
      sourceUrl: source.url,
      title: decodeHtml(title),
      description: decodeHtml(description),
      rawMetadata: { fetchedAt: new Date().toISOString() }
    };
  }
}
