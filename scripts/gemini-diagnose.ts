import "dotenv/config";
import { SourceType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { GeminiService } from "../lib/services/gemini-service";
import { SettingsService } from "../lib/services/settings-service";
import { SourceService } from "../lib/services/source-service";

const modelCandidates = [
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash"
];

function oneLine(value: unknown) {
  return String(value).replace(/\s+/g, " ").slice(0, 360);
}

const settings = await SettingsService.getAll();
const gemini = new GeminiService();

console.log(`Gemini API key: ${settings.geminiApiKey ? "configured" : "missing"}`);
console.log(`Configured model: ${settings.geminiModel}`);

if (settings.geminiApiKey) {
  console.log("\nModel access:");
  for (const model of modelCandidates) {
    try {
      await gemini.testConnection(model);
      console.log(`- ${model}: OK`);
    } catch (error) {
      console.log(`- ${model}: FAIL - ${oneLine((error as Error).message)}`);
    }
  }
}

const source = await prisma.source.findFirst({
  where: {
    active: true,
    type: { in: [SourceType.YOUTUBE_VIDEO, SourceType.YOUTUBE_PLAYLIST, SourceType.YOUTUBE_CHANNEL] }
  },
  orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
});

if (!source) {
  console.log("\nYouTube sample: no active YouTube source found.");
  await prisma.$disconnect();
  process.exit(0);
}

const [content] = await new SourceService().fetchContents(source, 1);
if (!content) {
  console.log(`\nYouTube sample: source ${source.name} returned no content.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log("\nYouTube extraction sample:");
console.log(`- Source: ${source.name}`);
console.log(`- URL: ${content.sourceUrl}`);
console.log(`- Title: ${content.title}`);
console.log(`- Transcript: ${content.transcript ? "yes" : "no"}`);

const analysis = await gemini.analyzeNews(content);
const raw = analysis.raw as {
  fallback?: boolean;
  provider?: string;
  model?: string;
  mode?: string;
  reason?: string;
  videoModeError?: string | null;
};

console.log("\nAnalysis result:");
console.log(`- Title: ${analysis.parsed.title}`);
console.log(`- Overall score: ${analysis.parsed.overallScore}`);
console.log(`- Fallback: ${raw?.fallback ? "yes" : "no"}`);
if (raw?.model) console.log(`- Model: ${raw.model}`);
if (raw?.mode) console.log(`- Mode: ${raw.mode}`);
if (raw?.videoModeError) console.log(`- YouTube URL mode error: ${oneLine(raw.videoModeError)}`);
if (raw?.reason) console.log(`- Reason: ${oneLine(raw.reason)}`);

await prisma.$disconnect();
