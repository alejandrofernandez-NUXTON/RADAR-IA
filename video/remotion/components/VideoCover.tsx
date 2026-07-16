import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export function VideoCover({ title, subtitle, date }: { title: string; subtitle?: string; date: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ fps, frame, config: { damping: 18, stiffness: 90 }, durationInFrames: 26 });
  const opacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#f4f7f5", color: "#172025", padding: "120px 150px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 310, height: 310, right: 105, top: 95, backgroundColor: "#172025", transform: "rotate(8deg)" }} />
      <div style={{ position: "absolute", width: 190, height: 190, right: 355, top: 335, backgroundColor: "#16a167" }} />
      <div style={{ position: "absolute", width: 125, height: 125, right: 165, top: 475, backgroundColor: "#e56b4a" }} />
      <div style={{ opacity, transform: `scale(${scale})`, transformOrigin: "left center", maxWidth: 1190 }}>
        <div style={{ color: "#16a167", fontSize: 30, fontWeight: 720, textTransform: "uppercase" }}>Nuxton Knowledge Platform</div>
        <div style={{ marginTop: 36, fontSize: 86, lineHeight: 1.04, fontWeight: 760, maxWidth: 1150 }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 30, color: "#536168", fontSize: 38, lineHeight: 1.3, maxWidth: 980 }}>{subtitle}</div> : null}
        <div style={{ marginTop: 58, fontSize: 27, color: "#6b777d" }}>{date}</div>
      </div>
      <div style={{ position: "absolute", right: 105, bottom: 55, color: "#6b777d", fontSize: 20 }}>
        Guion y voz generados con IA
      </div>
    </div>
  );
}
