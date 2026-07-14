import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
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
  if (data.length < 44 || data.toString("ascii", 0, 4) !== "RIFF") {
    throw new VideoDigestError("TTS_GENERATION_ERROR", "El proveedor TTS no genero un WAV valido.");
  }
  const channels = data.readUInt16LE(22);
  const sampleRate = data.readUInt32LE(24);
  const bitsPerSample = data.readUInt16LE(34);
  const dataSize = data.readUInt32LE(40);
  return dataSize / (sampleRate * channels * (bitsPerSample / 8));
}

type InteractionAudioResponse = {
  output_audio?: { data?: string; mime_type?: string };
};

type GenerateContentAudioResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
};

async function responseError(response: Response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: { message?: string } };
    return payload.error?.message || text;
  } catch {
    return text;
  }
}

export class GeminiTtsProvider implements TextToSpeechProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultVoice: string
  ) {}

  private async requestInteraction(input: TtsInput) {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        model: this.model.replace(/^models\//, ""),
        input: `Sintetiza voz en ${input.language} con tono profesional, claro y natural. Lee exactamente el texto situado despues de TRANSCRIPCION. No leas estas instrucciones.\n\nTRANSCRIPCION:\n${input.text}`,
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice: input.voice || this.defaultVoice }] }
      }),
      signal: combinedSignal(120_000, input.signal)
    });
    if (!response.ok) throw new Error(`Gemini TTS ${response.status}: ${await responseError(response)}`);
    const payload = (await response.json()) as InteractionAudioResponse;
    if (!payload.output_audio?.data) throw new Error("Gemini TTS no devolvio audio.");
    return {
      data: Buffer.from(payload.output_audio.data, "base64"),
      mimeType: payload.output_audio.mime_type || "audio/L16;rate=24000"
    };
  }

  private async requestGenerateContent(input: TtsInput) {
    const model = this.model.replace(/^models\//, "");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Lee en ${input.language}, con tono profesional y natural:\n${input.text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice || this.defaultVoice } }
            }
          }
        }),
        signal: combinedSignal(120_000, input.signal)
      }
    );
    if (!response.ok) throw new Error(`Gemini TTS ${response.status}: ${await responseError(response)}`);
    const payload = (await response.json()) as GenerateContentAudioResponse;
    const audio = payload.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!audio?.data) throw new Error("Gemini TTS no devolvio audio.");
    return { data: Buffer.from(audio.data, "base64"), mimeType: audio.mimeType || "audio/L16;rate=24000" };
  }

  async synthesize(input: TtsInput): Promise<TtsResult> {
    let audio: { data: Buffer; mimeType: string } | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        audio = await this.requestInteraction(input);
        break;
      } catch (interactionError) {
        if (input.signal?.aborted) throw interactionError;
        try {
          audio = await this.requestGenerateContent(input);
          break;
        } catch (generateError) {
          lastError = new Error(
            `${interactionError instanceof Error ? interactionError.message : "Interactions fallo"} | ${generateError instanceof Error ? generateError.message : "generateContent fallo"}`
          );
        }
      }
    }
    if (!audio) {
      throw new VideoDigestError(
        "TTS_GENERATION_ERROR",
        `No se pudo generar la narracion: ${lastError instanceof Error ? lastError.message : "error desconocido"}`,
        { cause: lastError }
      );
    }

    await mkdir(path.dirname(input.outputPath), { recursive: true });
    if (audio.data.toString("ascii", 0, 4) === "RIFF") {
      await writeFile(input.outputPath, audio.data);
    } else {
      await writePcmWave(input.outputPath, audio.data, 24_000);
    }
    return {
      outputPath: input.outputPath,
      durationSeconds: await getWaveDuration(input.outputPath),
      mimeType: "audio/wav",
      provider: "gemini",
      model: this.model
    };
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

export async function createTtsProvider(override?: "gemini" | "mock") {
  const settings = await SettingsService.getAll();
  const provider = override || settings.video.ttsProvider;
  if (provider === "mock") return new MockTtsProvider();
  if (!settings.geminiApiKey) {
    throw new VideoDigestError("TTS_GENERATION_ERROR", "Configura una API key de Gemini para generar la narracion.");
  }
  return new GeminiTtsProvider(settings.geminiApiKey, settings.video.ttsModel, settings.video.ttsVoice);
}
