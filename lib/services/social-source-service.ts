import { SourceType, type Source } from "@prisma/client";
import { SettingsService } from "@/lib/services/settings-service";
import type { SourceContent } from "@/lib/types";

const socialLabels: Partial<Record<SourceType, string>> = {
  TWITTER_CHANNEL: "X/Twitter",
  TIKTOK_CHANNEL: "TikTok",
  INSTAGRAM_CHANNEL: "Instagram"
};

const requirements: Partial<Record<SourceType, string>> = {
  TWITTER_CHANNEL: "un Bearer Token de X API con permiso de lectura del usuario y timeline",
  TIKTOK_CHANNEL: "una app de TikTok for Developers con acceso a la API de contenido o un proveedor externo autorizado",
  INSTAGRAM_CHANNEL: "un token de Instagram Graph API vinculado a una cuenta Business/Creator"
};

export class SocialSourceService {
  async getLatestChannelContent(source: Source, maxItems = 1): Promise<SourceContent[]> {
    if (source.type === SourceType.TWITTER_CHANNEL) {
      return this.getLatestXPosts(source, maxItems);
    }

    const label = socialLabels[source.type] || "red social";
    const requirement = requirements[source.type] || "credenciales oficiales de lectura";
    const handle = this.extractHandle(source.url);

    throw new Error(
      `No se puede leer la ultima publicacion de ${label} sin ${requirement}. Fuente: ${handle || source.url}. ` +
        "Configura un proveedor oficial antes de activar esta fuente en produccion."
    );
  }

  private async getLatestXPosts(source: Source, maxItems: number): Promise<SourceContent[]> {
    const username = this.extractXUsername(source.url);
    if (!username) {
      throw new Error(
        `No se pudo detectar el usuario de X/Twitter en la fuente "${source.url}". Usa una URL como https://x.com/OpenAI.`
      );
    }

    const bearerToken = await SettingsService.getString("x.bearerToken");
    if (!bearerToken) {
      throw new Error(
        "No se puede leer la ultima publicacion de X/Twitter sin un Bearer Token de X API. " +
          "Configurarlo en Admin > Ajustes > Redes sociales y usa una fuente como https://x.com/OpenAI."
      );
    }

    const user = await this.fetchXUser(username, bearerToken);
    const timeline = await this.fetchXTimeline(user.id, bearerToken);
    const posts = timeline.data || [];

    if (!posts.length) {
      throw new Error(`X API no devolvio publicaciones recientes para @${user.username || username}.`);
    }

    const mediaByKey = new Map((timeline.includes?.media || []).map((media) => [media.media_key, media]));
    const take = Math.max(1, maxItems);

    return posts.slice(0, take).map((post) => {
      const links = post.entities?.urls
        ?.map((link) => link.expanded_url || link.unwound_url || link.url)
        .filter(Boolean);
      const media = post.attachments?.media_keys?.map((key) => mediaByKey.get(key)).filter(Boolean);
      const metrics = post.public_metrics
        ? `Metrica publica: ${post.public_metrics.like_count || 0} likes, ${post.public_metrics.retweet_count || 0} reposts, ${post.public_metrics.reply_count || 0} respuestas.`
        : "";
      const context = [post.text, links?.length ? `Enlaces mencionados:\n${links.join("\n")}` : "", metrics]
        .filter(Boolean)
        .join("\n\n");

      return {
        source,
        sourceUrl: `https://x.com/${user.username || username}/status/${post.id}`,
        externalId: post.id,
        title: `Post de @${user.username || username}: ${this.truncateText(post.text, 100)}`,
        author: user.name ? `${user.name} (@${user.username || username})` : `@${user.username || username}`,
        description: context,
        publishedAt: post.created_at ? new Date(post.created_at) : undefined,
        rawMetadata: {
          provider: "x_api_v2",
          username: user.username || username,
          userId: user.id,
          postId: post.id,
          language: post.lang,
          publicMetrics: post.public_metrics,
          media,
          fetchedAt: new Date().toISOString()
        }
      };
    });
  }

  private async fetchXUser(username: string, bearerToken: string) {
    const params = new URLSearchParams({
      "user.fields": "id,name,username,description,verified,public_metrics"
    });
    const payload = await this.fetchXApi<XUserResponse>(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?${params.toString()}`,
      bearerToken
    );

    if (!payload.data?.id) {
      throw new Error(`X API no encontro el usuario @${username}.`);
    }

    return payload.data;
  }

  private async fetchXTimeline(userId: string, bearerToken: string) {
    const params = new URLSearchParams({
      max_results: "5",
      exclude: "retweets,replies",
      "tweet.fields": "created_at,text,public_metrics,entities,attachments,lang,possibly_sensitive",
      expansions: "attachments.media_keys",
      "media.fields": "url,preview_image_url,type,public_metrics"
    });

    return this.fetchXApi<XTimelineResponse>(
      `https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`,
      bearerToken
    );
  }

  private async fetchXApi<T>(url: string, bearerToken: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
        "User-Agent": "Nuxton Knowledge Platform/1.0"
      },
      signal: AbortSignal.timeout(30_000)
    });
    const text = await response.text();
    const payload = text ? this.parseJson(text) : {};

    if (!response.ok) {
      throw new Error(this.formatXApiError(response.status, payload));
    }

    return payload as T;
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return { detail: text.slice(0, 300) };
    }
  }

  private formatXApiError(status: number, payload: unknown) {
    if (status === 401 || status === 403) {
      return (
        "X API rechazo el Bearer Token. Revisa que el token sea de la app correcta, que la app tenga acceso de lectura " +
        "y que tu plan de X API permita User lookup y User posts."
      );
    }

    if (status === 429) {
      return "X API ha aplicado rate limit. Espera a que se reinicie la ventana de cuota o revisa el plan de la app.";
    }

    const detail = this.extractXApiDetail(payload);
    return `X API fallo con estado ${status}${detail ? `: ${detail}` : "."}`;
  }

  private extractXApiDetail(payload: unknown) {
    if (!payload || typeof payload !== "object") return "";
    const data = payload as { title?: string; detail?: string; errors?: XApiError[] };
    const firstError = data.errors?.[0];
    return firstError?.detail || firstError?.message || data.detail || data.title || "";
  }

  private extractXUsername(value: string) {
    const input = value.trim();
    if (!input) return null;

    const direct = input.replace(/^@/, "");
    if (/^[A-Za-z0-9_]{1,15}$/.test(direct)) return direct;

    try {
      const parsed = new URL(input);
      const reservedPaths = new Set([
        "home",
        "explore",
        "search",
        "notifications",
        "messages",
        "settings",
        "i",
        "intent",
        "share"
      ]);
      const segment = parsed.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "");
      if (segment && !reservedPaths.has(segment.toLowerCase()) && /^[A-Za-z0-9_]{1,15}$/.test(segment)) {
        return segment;
      }
    } catch {
      return null;
    }

    return null;
  }

  private truncateText(value: string, maxLength: number) {
    const compact = value.replace(/\s+/g, " ").trim();
    return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
  }

  private extractHandle(url: string) {
    try {
      const parsed = new URL(url);
      const firstPath = parsed.pathname.split("/").filter(Boolean)[0];
      return firstPath ? `@${firstPath.replace(/^@/, "")}` : parsed.hostname;
    } catch {
      return url.trim() || null;
    }
  }
}

type XApiError = {
  title?: string;
  detail?: string;
  message?: string;
};

type XUserResponse = {
  data?: {
    id: string;
    name?: string;
    username?: string;
    description?: string;
    verified?: boolean;
    public_metrics?: Record<string, number>;
  };
  errors?: XApiError[];
};

type XTimelineResponse = {
  data?: XPost[];
  includes?: {
    media?: XMedia[];
  };
  errors?: XApiError[];
};

type XPost = {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  possibly_sensitive?: boolean;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
      unwound_url?: string;
      display_url?: string;
    }>;
  };
  attachments?: {
    media_keys?: string[];
  };
};

type XMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  public_metrics?: Record<string, number>;
};
