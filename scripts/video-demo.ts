import "dotenv/config";
import path from "path";
import { writeFile } from "fs/promises";
import { NarrationService } from "../video/services/narration-service";
import { timelineToSrt } from "../video/services/subtitle-service";
import { MockTtsProvider } from "../video/services/tts-provider";
import { VideoRenderService } from "../video/services/video-render-service";
import { createDemoScript } from "../video/services/video-script-service";
import { LocalVideoStorageProvider } from "../video/services/video-storage-service";
import type { JobProgressReporter } from "../lib/types";
import type { VideoRenderProps } from "../video/types/video-types";
import { buildTimeline } from "../video/utils/timing";

async function main() {
  const demoId = `demo-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const baseDirectory = path.resolve(process.cwd(), process.env.VIDEO_OUTPUT_DIRECTORY || "./data/video-digests");
  const storage = new LocalVideoStorageProvider(baseDirectory);
  const workspace = await storage.workspace(demoId);
  const script = createDemoScript();
  const fps = Number(process.env.VIDEO_DEMO_FPS || 24);
  const width = Number(process.env.VIDEO_DEMO_WIDTH || 1280);
  const height = Number(process.env.VIDEO_DEMO_HEIGHT || 720);
  const progress: JobProgressReporter = ({ percent, message }) => {
    process.stdout.write(`${String(Math.round(percent)).padStart(3, " ")}% ${message}\n`);
  };

  const narration = new NarrationService(new MockTtsProvider());
  const tracks = await narration.generate(script, workspace.publicDirectory, "es-ES", "Kore", progress);
  const timeline = buildTimeline(script, tracks, fps);
  await writeFile(workspace.subtitlePath, timelineToSrt(timeline), "utf8");
  const props: VideoRenderProps = {
    script,
    timeline,
    width,
    height,
    fps,
    generatedDate: new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "long", year: "numeric" }).format(new Date())
  };
  const metadata = await new VideoRenderService().render(props, workspace, progress);
  await storage.writeJson(workspace.manifestKey, { demo: true, script, timeline, metadata });
  await storage.cleanupTemp(demoId);
  process.stdout.write(`\nVideo demo generado sin noticias reales y sin Telegram:\n${workspace.videoPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
