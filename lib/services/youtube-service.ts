import type { Source } from "@prisma/client";
import type { SourceContent } from "@/lib/types";
import { YouTubeMediaService } from "@/lib/services/youtube-media-service";

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

type YouTubeRenderer = Record<string, unknown>;

type YouTubeTabVideo = {
  id: string;
  title: string;
  url: string;
  publishedText?: string;
  lengthText?: string;
  viewCountText?: string;
};

function rendererText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const renderer = value as {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
  return renderer.simpleText || renderer.runs?.map((run) => run.text || "").join("") || "";
}

function rendererEndpointUrl(renderer: YouTubeRenderer) {
  const endpoint = renderer.navigationEndpoint as
    | {
        commandMetadata?: {
          webCommandMetadata?: {
            url?: string;
          };
        };
      }
    | undefined;

  return endpoint?.commandMetadata?.webCommandMetadata?.url || "";
}

function hasShortsOverlay(renderer: YouTubeRenderer) {
  const overlays = renderer.thumbnailOverlays;
  if (!Array.isArray(overlays)) return false;

  return overlays.some((overlay) => {
    const status = (overlay as { thumbnailOverlayTimeStatusRenderer?: { style?: string } }).thumbnailOverlayTimeStatusRenderer;
    return status?.style === "SHORTS";
  });
}

function collectUrls(node: unknown, urls: string[] = []) {
  if (!node || typeof node !== "object") return urls;
  const object = node as Record<string, unknown>;
  if (typeof object.url === "string") urls.push(object.url);

  for (const value of Object.values(object)) {
    if (Array.isArray(value)) {
      for (const item of value) collectUrls(item, urls);
    } else if (value && typeof value === "object") {
      collectUrls(value, urls);
    }
  }

  return urls;
}

function collectBadgeTexts(node: unknown, texts: string[] = []) {
  if (!node || typeof node !== "object") return texts;
  const object = node as Record<string, unknown>;
  const badge = object.thumbnailBadgeViewModel as { text?: string } | undefined;
  if (badge?.text) texts.push(badge.text);

  for (const value of Object.values(object)) {
    if (Array.isArray(value)) {
      for (const item of value) collectBadgeTexts(item, texts);
    } else if (value && typeof value === "object") {
      collectBadgeTexts(value, texts);
    }
  }

  return texts;
}

function textContent(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return String((value as { content?: unknown }).content || "");
}

function extractInitialData(html: string) {
  const markers = ["var ytInitialData =", "ytInitialData =", "window[\"ytInitialData\"] ="];
  const markerIndex = markers.map((marker) => html.indexOf(marker)).find((index) => index >= 0) ?? -1;
  if (markerIndex < 0) return null;

  const start = html.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < html.length; index += 1) {
    const char = html[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }

  return null;
}

function parseChannelVideosTabUrl(url: string) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  let channelPath = parsed.pathname.replace(/\/$/, "");

  if (parts[0]?.startsWith("@")) {
    channelPath = `/${parts[0]}`;
  } else if ((parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") && parts[1]) {
    channelPath = `/${parts[0]}/${parts[1]}`;
  }

  const videosUrl = new URL(`${parsed.origin}${channelPath}/videos`);
  videosUrl.searchParams.set("view", "0");
  videosUrl.searchParams.set("sort", "dd");
  videosUrl.searchParams.set("shelf_id", "0");
  return videosUrl.toString();
}

function videoFromRenderer(renderer: YouTubeRenderer): YouTubeTabVideo | null {
  const videoId = typeof renderer.videoId === "string" ? renderer.videoId : null;
  const endpointUrl = rendererEndpointUrl(renderer);
  const title = rendererText(renderer.title);

  if (!videoId || !title) return null;
  if (hasShortsOverlay(renderer) || endpointUrl.includes("/shorts/")) return null;

  return {
    id: videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedText: rendererText(renderer.publishedTimeText),
    lengthText: rendererText(renderer.lengthText),
    viewCountText: rendererText(renderer.viewCountText)
  };
}

function videoFromLockup(lockup: YouTubeRenderer): YouTubeTabVideo | null {
  const videoId = typeof lockup.contentId === "string" ? lockup.contentId : null;
  const metadata = lockup.metadata as
    | {
        lockupMetadataViewModel?: {
          title?: { content?: string };
          metadata?: {
            contentMetadataViewModel?: {
              metadataRows?: Array<{
                metadataParts?: Array<{
                  text?: { content?: string };
                  accessibilityLabel?: string;
                }>;
              }>;
            };
          };
        };
      }
    | undefined;
  const title = metadata?.lockupMetadataViewModel?.title?.content || "";
  const urls = collectUrls(lockup);
  const watchUrl = urls.find((url) => videoId && url.includes(`/watch?v=${videoId}`)) || "";

  if (!videoId || !title || watchUrl.includes("/shorts/")) return null;

  const metadataParts =
    metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap((row) => row.metadataParts || []) || [];
  const metadataTexts = metadataParts.map((part) => textContent(part.text) || part.accessibilityLabel || "").filter(Boolean);
  const viewCountText = metadataTexts.find((text) => /visualizaciones|views/i.test(text));
  const publishedText = metadataTexts.find((text) => text !== viewCountText);
  const lengthText = collectBadgeTexts(lockup).find((text) => /\d+:\d+/.test(text));

  return {
    id: videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    publishedText,
    lengthText,
    viewCountText
  };
}

function collectVideoRenderers(node: unknown, videos: YouTubeTabVideo[], seen: Set<string>) {
  if (!node || typeof node !== "object") return;

  const object = node as Record<string, unknown>;
  const renderer = object.videoRenderer || object.gridVideoRenderer || object.lockupViewModel;
  if (renderer && typeof renderer === "object") {
    const video =
      object.lockupViewModel === renderer
        ? videoFromLockup(renderer as YouTubeRenderer)
        : videoFromRenderer(renderer as YouTubeRenderer);
    if (video && !seen.has(video.id)) {
      seen.add(video.id);
      videos.push(video);
    }
  }

  for (const value of Object.values(object)) {
    if (Array.isArray(value)) {
      for (const item of value) collectVideoRenderers(item, videos, seen);
    } else if (value && typeof value === "object") {
      collectVideoRenderers(value, videos, seen);
    }
  }
}

export class YouTubeService {
  private readonly mediaService = new YouTubeMediaService();

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
    return this.getChannelVideosTabContents(source, limit);
  }

  private async getChannelVideosTabContents(source: Source, limit: number): Promise<SourceContent[]> {
    const videosTabUrl = parseChannelVideosTabUrl(source.url);
    const response = await fetch(videosTabUrl, {
      headers: {
        "Accept-Language": `${source.language || "es"},es;q=0.9,en;q=0.8`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`No se pudo leer la pestana Videos del canal de YouTube. HTTP ${response.status}`);
    }

    const html = await response.text();
    const initialData = extractInitialData(html);
    if (!initialData) {
      throw new Error("No se pudo encontrar ytInitialData en la pestana Videos del canal.");
    }

    const payload = JSON.parse(initialData) as unknown;
    const videos: YouTubeTabVideo[] = [];
    collectVideoRenderers(payload, videos, new Set<string>());
    const selectedVideos = videos.slice(0, limit);

    if (!selectedVideos.length) {
      throw new Error("La pestana Videos no devolvio videos normales. No se usara RSS para evitar mezclar Shorts, directos u otras secciones.");
    }

    return Promise.all(
      selectedVideos.map(async (video, index) => {
        const content = await this.getVideoContent(source, video.url);
        return {
          ...content,
          title: content.title || video.title,
          rawMetadata: {
            ...content.rawMetadata,
            discoveredFrom: "youtube_channel_videos_tab",
            videosTabUrl,
            videosTabOrder: index + 1,
            videosTabTitle: video.title,
            videosTabPublishedText: video.publishedText,
            videosTabLengthText: video.lengthText,
            videosTabViewCountText: video.viewCountText
          }
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
    try {
      const listResponse = await fetch(`https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`, {
        signal: AbortSignal.timeout(20_000)
      });
      if (listResponse.ok) {
        const listXml = await listResponse.text();
        const languages = [...listXml.matchAll(/lang_code="([^"]+)"/gi)].map((match) => match[1]);
        const language = languages.find((item) => item.startsWith("es")) || languages.find((item) => item.startsWith("en")) || languages[0];
        if (language) {
          const transcriptResponse = await fetch(
            `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}`,
            { signal: AbortSignal.timeout(20_000) }
          );
          if (transcriptResponse.ok) {
            const xml = await transcriptResponse.text();
            const transcript = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)]
              .map((match) => stripTags(match[1]))
              .join(" ")
              .replace(/\s+/g, " ")
              .trim();
            if (transcript.length >= 500) return transcript;
          }
        }
      }
    } catch {
      // YouTube.js provides the current fallback below.
    }

    const evidence = await this.mediaService.collectEvidence(`https://www.youtube.com/watch?v=${videoId}`);
    return evidence.transcript;
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
