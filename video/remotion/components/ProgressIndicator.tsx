import { useCurrentFrame } from "remotion";

export function ProgressIndicator({ startFrame, total }: { startFrame: number; total: number }) {
  const current = startFrame + useCurrentFrame();
  const percent = Math.max(0, Math.min(100, (current / Math.max(1, total)) * 100));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 8, backgroundColor: "#dfe5e2" }}>
      <div style={{ width: `${percent}%`, height: "100%", backgroundColor: "#16a167" }} />
    </div>
  );
}
