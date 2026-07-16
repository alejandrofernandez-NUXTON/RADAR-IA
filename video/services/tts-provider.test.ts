import { describe, expect, it } from "vitest";
import { getWaveDurationFromBuffer } from "@/video/services/tts-provider";

function streamingWave(durationSeconds: number, sampleRate = 24_000) {
  const pcm = Buffer.alloc(durationSeconds * sampleRate * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(0xffffffff, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(0xffffffff, 40);
  return Buffer.concat([header, pcm]);
}

describe("OpenAI streaming WAV", () => {
  it("uses the real remaining bytes when the data chunk has an unknown size", () => {
    expect(getWaveDurationFromBuffer(streamingWave(2))).toBe(2);
  });
});
