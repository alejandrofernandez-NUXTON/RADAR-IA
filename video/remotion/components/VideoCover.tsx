import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BrandMark } from "./BrandMark";
import { NetworkGraphic } from "./NetworkGraphic";
import { videoFonts, videoTheme } from "../theme";

export function VideoCover({ title, subtitle, date }: { title: string; subtitle?: string; date: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ fps, frame, config: { damping: 18, stiffness: 90 }, durationInFrames: 26 });
  const opacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  const titleSize = title.length > 92 ? 72 : title.length > 62 ? 82 : 94;
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: videoTheme.background, color: videoTheme.white, padding: "74px 82px", position: "relative", overflow: "hidden", fontFamily: videoFonts.sans }}>
      <BrandMark />
      <div style={{ position: "absolute", right: -95, top: 86, opacity: 0.92 }}>
        <NetworkGraphic size={780} />
      </div>
      <div style={{ position: "absolute", left: 82, top: 410, width: 1050, opacity, transform: `scale(${scale})`, transformOrigin: "left center" }}>
        <div style={{ color: videoTheme.cyan, fontSize: 24, fontWeight: 700, textTransform: "uppercase" }}>Radar IA diario</div>
        <div style={{ marginTop: 24, fontFamily: videoFonts.display, fontSize: titleSize, lineHeight: 1.03, fontWeight: 400, maxWidth: 1040 }}>{title}</div>
        <div style={{ marginTop: 28, width: 118, height: 4, backgroundColor: videoTheme.blue }} />
        {subtitle ? <div style={{ marginTop: 24, color: videoTheme.muted, fontSize: 31, lineHeight: 1.34, maxWidth: 940 }}>{subtitle}</div> : null}
        <div style={{ marginTop: 30, fontSize: 22, color: videoTheme.muted }}>{date}</div>
      </div>
      <div style={{ position: "absolute", right: 82, bottom: 42, color: videoTheme.muted, fontSize: 18 }}>
        Nuxton Knowledge Platform
      </div>
    </div>
  );
}
