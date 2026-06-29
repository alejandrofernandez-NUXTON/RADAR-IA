import type { Source } from "@prisma/client";
import type { SourceContent } from "@/lib/types";

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function getTagValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripTags(match[1]) : "";
}

export class YouTubeService {
  parseVideoId(url: string) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0];
      if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const markerIndex = pathParts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
      return markerIndex >= 0 ? pathParts[markerIndex + 1] : null;
    } catch {
      return null;
    }
  }

  parsePlaylistId(url: string) {
    try {
      return new URL(url).searchParams.get("list");
    } catch {
      return null;
    }
  }

  async getVideoContent(source: Source, videoUrl: string): Promise<SourceContent> {
    const videoId = this.parseVideoId(videoUrl);
    const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : videoUrl;
    const metadata = await this.fetchVideoMetadata(canonicalUrl);
    const transcript = videoId ? await this.fetchTranscript(videoId).catch(() => "") : "";

    return {
      source,
      sourceUrl: canonicalUrl,
      externalId: videoId || undefined,
      title: metadata.title || source.name,
      author: metadata.author,
      description: metadata.description,
      transcript,
      publishedAt: metadata.publishedAt,
      rawMetadata: metadata
    };
  }

  async getPlaylistContents(source: Source, limit = 5): Promise<SourceContent[]> {
    const playlistId = this.parsePlaylistId(source.url);
    if (!playlistId) return [await this.getVideoContent(source, source.url)];

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlistId)}`;
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`YouTube playlist feed failed with status ${response.status}`);
    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, limit);

    return Promise.all(
      entries.map(async ([, entry]) => {
        const id = getTagValue(entry, "yt:videoId");
        const link = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || `https://www.youtube.com/watch?v=${id}`;
        const title = getTagValue(entry, "title");
        const author = getTagValue(entry, "name");
        const published = getTagValue(entry, "published");
        const description = getTagValue(entry, "media:description");
        const transcript = id ? await this.fetchTranscript(id).catch(() => "") : "";

        return {
          source,
          sourceUrl: link,
          externalId: id || undefined,
          title: title || source.name,
          author,
          description,
          transcript,
          publishedAt: published ? new Date(published) : undefined,
          rawMetadata: { playlistId, feedUrl }
        };
      })
    );
  }

  async getChannelContents(source: Source, limit = 5): Promise<SourceContent[]> {
    const channelId = await this.resolveChannelId(source.url);
    if (!channelId) {
      return [
        {
          source,
          sourceUrl: source.url,
          title: source.name,
          description: "Canal de YouTube pendiente de resolver. Usa videos concretos o playlists para maxima fiabilidad.",
          rawMetadata: { channelResolution: "failed" }
        }
      ];
    }

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    const response = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`YouTube channel feed failed with status ${response.status}`);
    const xml = await response.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, limit);

    return Promise.all(
      entries.map(async ([, entry]) => {
        const id = getTagValue(entry, "yt:videoId");
        const title = getTagValue(entry, "title");
        const author = getTagValue(entry, "name");
        const published = getTagValue(entry, "published");
        const description = getTagValue(entry, "media:description");
        const transcript = id ? await this.fetchTranscript(id).catch(() => "") : "";

        return {
          source,
          sourceUrl: `https://www.youtube.com/watch?v=${id}`,
          externalId: id || undefined,
          title: title || source.name,
          author,
          description,
          transcript,
          publishedAt: published ? new Date(published) : undefined,
          rawMetadata: { channelId, feedUrl }
        };
      })
    );
  }

  private async fetchVideoMetadata(videoUrl: string) {
    const metadata: {
      title?: string;
      author?: string;
      description?: string;
      publishedAt?: Date;
    } = {};

    const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`, {
      signal: AbortSignal.timeout(20_000)
    }).catch(() => null);

    if (oembed?.ok) {
      const json = (await oembed.json()) as { title?: string; author_name?: string };
      metadata.title = json.title;
      metadata.author = json.author_name;
    }

    const page = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (page?.ok) {
      const html = await page.text();
      const description = html.match(/"shortDescription":"((?:\\"|[^"])*)"/)?.[1];
      const publishDate = html.match(/"publishDate":"([^"]+)"/)?.[1] || html.match(/"datePublished":"([^"]+)"/)?.[1];
      if (description) metadata.description = decodeHtml(description.replaceAll('\\"', '"').replaceAll("\\n", "\n"));
      if (publishDate) metadata.publishedAt = new Date(publishDate);
    }

    return metadata;
  }

  private async fetchTranscript(videoId: string) {
    const listResponse = await fetch(`https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(20_000)
    });
    if (!listResponse.ok) return "";
    const listXml = await listResponse.text();
    const languages = [...listXml.matchAll(/lang_code="([^"]+)"/gi)].map((match) => match[1]);
    const language = languages.find((item) => item.startsWith("es")) || languages.find((item) => item.startsWith("en")) || languages[0];
    if (!language) return "";

    const transcriptResponse = await fetch(
      `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}`,
      { signal: AbortSignal.timeout(20_000) }
    );
    if (!transcriptResponse.ok) return "";
    const xml = await transcriptResponse.text();
    return [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)]
      .map((match) => stripTags(match[1]))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private async resolveChannelId(url: string) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const channelIndex = parts.indexOf("channel");
      if (channelIndex >= 0 && parts[channelIndex + 1]) return parts[channelIndex + 1];

      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) return null;
      const html = await response.text();
      return html.match(/"channelId":"(UC[^"]+)"/)?.[1] || html.match(/"externalId":"(UC[^"]+)"/)?.[1] || null;
    } catch {
      return null;
    }
  }
}
