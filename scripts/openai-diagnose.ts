import "dotenv/config";
import { OpenAIService } from "../lib/services/openai-service";
import { SettingsService } from "../lib/services/settings-service";

const settings = await SettingsService.getAll();
console.log(`OpenAI API key: ${settings.openaiApiKey ? "configured" : "missing"}`);
console.log(`Analysis model: ${settings.openaiModel}`);
console.log(`Transcription model: ${settings.openaiTranscriptionModel}`);
console.log(`TTS model: ${settings.video.ttsModel}`);
console.log(`TTS voice: ${settings.video.ttsVoice}`);

if (!settings.openaiApiKey) {
  process.exitCode = 1;
} else {
  try {
    const result = await new OpenAIService().testConnection();
    console.log(`OK OpenAI connection: ${result.model} (${result.responseId})`);
  } catch (error) {
    console.error(`FAIL OpenAI connection: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
