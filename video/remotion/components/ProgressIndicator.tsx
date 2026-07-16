import { useCurrentFrame } from "remotion";
import { videoTheme } from "../theme";

export function ProgressIndicator({ startFrame, total }: { startFrame: number; total: number }) {
  const current = startFrame + useCurrentFrame();
  const percent = Math.max(0, Math.min(100, (current / Math.max(1, total)) * 100));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 5, backgroundColor: "rgba(103, 195, 255, 0.14)" }}>
      <div style={{ width: `${percent}%`, height: "100%", backgroundColor: videoTheme.blue, boxShadow: "0 0 12px rgba(22, 136, 255, 0.65)" }} />
    </div>
  );
}
