import { spawn } from "child_process";
import { open, mkdtemp, readdir, rm, stat } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import path from "path";
import { Innertube, UniversalCache } from "youtubei.js";

const MAX_OPENAI_AUDIO_BYTES = 24 * 1024 * 1024;

export type YouTubeEvidence = {
  videoId: string;
  transcript: string;
  transcriptSource: "collected_captions" | "youtube_captions" | "openai_transcription" | "unavailable";
  imageUrls: string[];
  durationSeconds?: number;
  title?: string;
  author?: string;
};

export type DownloadedYouTubeAudio = {
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  cleanup: () => Promise<void>;
};

function parseVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || null;
    const queryId = url.searchParams.get("v");
    if (queryId) return queryId;
    const parts = url.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((part) => ["embed", "shorts", "live"].includes(part));
    return marker >= 0 ? parts[marker + 1] || null : null;
  } catch {
    return null;
  }
}

function usefulTranscript(value?: string) {
  return Boolean(value && value.replace(/\s+/g, " ").trim().length >= 500);
}

function selectStoryboardUrls(boards: Array<{
  template_url: string;
  thumbnail_width: number;
  thumbnail_height: number;
  storyboard_count: number;
}>) {
  const board = [...boards].sort(
    (left, right) => right.thumbnail_width * right.thumbnail_height - left.thumbnail_width * left.thumbnail_height
  )[0];
  if (!board?.template_url || board.storyboard_count < 1) return [];

  const count = Math.min(3, board.storyboard_count);
  const indexes = Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round((index * (board.storyboard_count - 1)) / (count - 1))
  );
  return [...new Set(indexes)].map((index) => board.template_url.replaceAll("$M", String(index)));
}

function audioExtension(mimeType: string) {
  if (/webm/i.test(mimeType)) return "webm";
  if (/mp4|m4a/i.test(mimeType)) return "m4a";
  if (/mpeg|mp3/i.test(mimeType)) return "mp3";
  return "audio";
}

function audioMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".mp3":
    case ".mpga":
    case ".mpeg":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

function stoppedMessage(signal?: AbortSignal) {
  return typeof signal?.reason === "string" ? signal.reason : "Proceso detenido manualmente.";
}

function ytDlpBinaryPath() {
  const require = createRequire(import.meta.url);
  const packagePath = require.resolve("youtube-dl-exec/package.json");
  return path.join(path.dirname(packagePath), "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
}

export class YouTubeMediaService {
  private static clientPromise: Promise<Innertube> | null = null;

  private getClient() {
    if (!YouTubeMediaService.clientPromise) {
      YouTubeMediaService.clientPromise = Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true
      });
    }
    return YouTubeMediaService.clientPromise;
  }

  async collectEvidence(videoUrl: string, existingTranscript?: string, preferredLanguage = "es"): Promise<YouTubeEvidence> {
    const videoId = parseVideoId(videoUrl);
    if (!videoId) throw new Error("La URL de YouTube no contiene un identificador de video valido.");

    const fallbackImage = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
    let transcript = usefulTranscript(existingTranscript) ? existingTranscript!.replace(/\s+/g, " ").trim() : "";
    let transcriptSource: YouTubeEvidence["transcriptSource"] = transcript ? "collected_captions" : "unavailable";

    try {
      const client = await this.getClient();
      const info = await client.getInfo(videoId);
      if (!transcript) {
        try {
          let transcriptInfo = await info.getTranscript();
          const language = transcriptInfo.languages.find((candidate) =>
            preferredLanguage.startsWith("es")
              ? /espa|spanish|^es(?:-|$)/i.test(candidate)
              : candidate.toLowerCase().startsWith(preferredLanguage.toLowerCase())
          );
          if (language && language !== transcriptInfo.selectedLanguage) {
            transcriptInfo = await transcriptInfo.selectLanguage(language);
          }
          const segments = transcriptInfo.transcript.content?.body?.initial_segments || [];
          transcript = segments
            .filter((segment) => "snippet" in segment)
            .map((segment) => ("snippet" in segment ? segment.snippet.toString() : ""))
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          if (usefulTranscript(transcript)) transcriptSource = "youtube_captions";
        } catch {
          transcript = "";
        }
      }

      const storyboardUrls = info.storyboards && "boards" in info.storyboards
        ? selectStoryboardUrls(info.storyboards.boards)
        : [];
      return {
        videoId,
        transcript,
        transcriptSource: usefulTranscript(transcript) ? transcriptSource : "unavailable",
        imageUrls: [...storyboardUrls, fallbackImage],
        durationSeconds: info.basic_info.duration,
        title: info.basic_info.title,
        author: info.basic_info.author
      };
    } catch {
      return {
        videoId,
        transcript,
        transcriptSource: usefulTranscript(transcript) ? transcriptSource : "unavailable",
        imageUrls: [fallbackImage]
      };
    }
  }

  async downloadAudio(videoUrl: string, signal?: AbortSignal): Promise<DownloadedYouTubeAudio> {
    const videoId = parseVideoId(videoUrl);
    if (!videoId) throw new Error("La URL de YouTube no contiene un identificador de video valido.");
    if (signal?.aborted) throw new Error(stoppedMessage(signal));

    let durationSeconds: number | undefined;
    try {
      const client = await this.getClient();
      const info = await client.getInfo(videoId);
      durationSeconds = info.basic_info.duration;
      const format = info.chooseFormat({ type: "audio", quality: "bestefficiency", format: "any" });
      if (format.content_length && format.content_length > MAX_OPENAI_AUDIO_BYTES) {
        throw new Error(
          `El audio ocupa ${Math.ceil(format.content_length / 1024 / 1024)} MB y supera el limite operativo de 24 MB para transcripcion.`
        );
      }

      const directory = await mkdtemp(path.join(tmpdir(), "nuxton-youtube-"));
      const mimeType = format.mime_type.split(";")[0] || "audio/webm";
      const filePath = path.join(directory, `source.${audioExtension(mimeType)}`);
      const handle = await open(filePath, "w");
      let sizeBytes = 0;

      try {
        const stream = await info.download({ itag: format.itag });
        const reader = stream.getReader();
        while (true) {
          if (signal?.aborted) {
            await reader.cancel(signal.reason);
            throw new Error(stoppedMessage(signal));
          }
          const chunk = await reader.read();
          if (chunk.done) break;
          sizeBytes += chunk.value.byteLength;
          if (sizeBytes > MAX_OPENAI_AUDIO_BYTES) {
            await reader.cancel("Audio demasiado grande para OpenAI.");
            throw new Error("El audio descargado supera el limite operativo de 24 MB para transcripcion.");
          }
          await handle.write(chunk.value);
        }
      } catch (error) {
        await handle.close().catch(() => undefined);
        await rm(directory, { recursive: true, force: true });
        throw error;
      }

      await handle.close();
      return {
        filePath,
        mimeType,
        sizeBytes,
        durationSeconds,
        cleanup: () => rm(directory, { recursive: true, force: true })
      };
    } catch (directError) {
      if (signal?.aborted) throw new Error(stoppedMessage(signal));
      return this.downloadAudioWithYtDlp(videoUrl, signal, durationSeconds, directError);
    }
  }

  private async downloadAudioWithYtDlp(
    videoUrl: string,
    signal?: AbortSignal,
    durationSeconds?: number,
    directError?: unknown
  ): Promise<DownloadedYouTubeAudio> {
    const directory = await mkdtemp(path.join(tmpdir(), "nuxton-ytdlp-"));
    const outputTemplate = path.join(directory, "source.%(ext)s");
    const subprocess = spawn(
      ytDlpBinaryPath(),
      [
        "--format", "worstaudio/worst",
        "--output", outputTemplate,
        "--no-playlist",
        "--no-progress",
        "--no-warnings",
        "--no-part",
        "--max-filesize", "24M",
        "--js-runtimes", "node",
        "--remote-components", "ejs:github",
        "--",
        videoUrl
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"]
      }
    );

    let stderr = "";
    subprocess.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-6000);
    });
    const stop = () => subprocess.kill("SIGKILL");
    const timeout = setTimeout(stop, 15 * 60 * 1000);
    signal?.addEventListener("abort", stop, { once: true });

    try {
      await new Promise<void>((resolve, reject) => {
        subprocess.once("error", reject);
        subprocess.once("exit", (code, exitSignal) => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `yt-dlp termino con codigo ${code ?? exitSignal ?? "desconocido"}.`));
        });
      });
      if (signal?.aborted) throw new Error(stoppedMessage(signal));

      const files = (await readdir(directory)).filter((file) => !file.endsWith(".part") && file.startsWith("source."));
      if (files.length !== 1) {
        throw new Error("yt-dlp no genero un archivo de audio reconocible.");
      }
      const filePath = path.join(directory, files[0]);
      const details = await stat(filePath);
      if (!details.size || details.size > MAX_OPENAI_AUDIO_BYTES) {
        throw new Error("El audio descargado supera el limite operativo de 24 MB para transcripcion.");
      }

      return {
        filePath,
        mimeType: audioMimeType(filePath),
        sizeBytes: details.size,
        durationSeconds,
        cleanup: () => rm(directory, { recursive: true, force: true })
      };
    } catch (fallbackError) {
      await rm(directory, { recursive: true, force: true });
      if (signal?.aborted) throw new Error(stoppedMessage(signal));
      const first = directError instanceof Error ? directError.message : String(directError || "desconocido");
      const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`No se pudo descargar el audio de YouTube. Extractor principal: ${first}. Fallback yt-dlp: ${second}`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", stop);
    }
  }
}

export function hasUsefulYouTubeTranscript(value?: string) {
  return usefulTranscript(value);
}
