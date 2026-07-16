import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { SettingsService } from "@/lib/services/settings-service";
import { VideoDigestError } from "@/video/errors";
import type { TtsResult } from "@/video/types/video-types";

export type TtsInput = {
  text: string;
  language: string;
  voice?: string;
  outputPath: string;
  signal?: AbortSignal;
};

export interface TextToSpeechProvider {
  synthesize(input: TtsInput): Promise<TtsResult>;
}

function combinedSignal(timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

function wavHeader(pcmBytes: number, sampleRate = 24_000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes, 40);
  return header;
}

export async function writePcmWave(outputPath: string, pcm: Buffer, sampleRate = 24_000) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([wavHeader(pcm.length, sampleRate), pcm]));
}

export async function getWaveDuration(outputPath: string) {
  const data = await readFile(outputPath);
  if (data.length < 12 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE") {
    throw new VideoDigestError("TTS_GENERATION_ERROR", "El proveedor TTS no genero un WAV valido.");
  }

  let byteRate = 0;
  let audioBytes = 0;
  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunkId = data.toString("ascii", offset, offset + 4);
    const chunkSize = data.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > data.length) break;
    if (chunkId === "fmt " && chunkSize >= 12) byteRate = data.readUInt32LE(chunkStart + 8);
    if (chunkId === "data") audioBytes = chunkSize;
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (!byteRate || !audioBytes) {
    throw new VideoDigestError("TTS_GENERATION_ERROR", "El WAV de OpenAI no contiene chunks de audio validos.");
  }
  return audioBytes / byteRate;
}

export class OpenAITtsProvider implements TextToSpeechProvider {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly defaultVoice: string
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  async synthesize(input: TtsInput): Promise<TtsResult> {
    try {
      const response = await this.client.audio.speech.create(
        {
          model: this.model,
          voice: input.voice || this.defaultVoice,
          input: input.text,
          instructions: `Habla en ${input.language}, con espanol natural de Espana, tono profesional, claro y ejecutivo. Respeta nombres propios, cifras y pausas. No anadas ni elimines contenido.`,
          response_format: "wav"
        },
        { signal: combinedSignal(120_000, input.signal) }
      );
      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.toString("ascii", 0, 4) !== "RIFF") {
        throw new Error("OpenAI no devolvio un WAV valido.");
      }
      await mkdir(path.dirname(input.outputPath), { recursive: true });
      await writeFile(input.outputPath, audio);
      return {
        outputPath: input.outputPath,
        durationSeconds: await getWaveDuration(input.outputPath),
        mimeType: "audio/wav",
        provider: "openai",
        model: this.model
      };
    } catch (error) {
      throw new VideoDigestError(
        "TTS_GENERATION_ERROR",
        `No se pudo generar la narracion con OpenAI: ${error instanceof Error ? error.message : "error desconocido"}`,
        { cause: error }
      );
    }
  }
}

export class MockTtsProvider implements TextToSpeechProvider {
  async synthesize(input: TtsInput): Promise<TtsResult> {
    if (input.signal?.aborted) throw new Error("Proceso detenido manualmente.");
    const words = input.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSeconds = Math.max(2, Math.min(30, words / 2.8 + 0.6));
    const pcm = Buffer.alloc(Math.ceil(durationSeconds * 24_000 * 2));
    await writePcmWave(input.outputPath, pcm);
    return {
      outputPath: input.outputPath,
      durationSeconds: await getWaveDuration(input.outputPath),
      mimeType: "audio/wav",
      provider: "mock"
    };
  }
}

export async function createTtsProvider(override?: "openai" | "mock") {
  const settings = await SettingsService.getAll();
  const provider = override || settings.video.ttsProvider;
  if (provider === "mock") return new MockTtsProvider();
  if (!settings.openaiApiKey) {
    throw new VideoDigestError("TTS_GENERATION_ERROR", "Configura una API key de OpenAI para generar la narracion.");
  }
  return new OpenAITtsProvider(settings.openaiApiKey, settings.video.ttsModel, settings.video.ttsVoice);
}
