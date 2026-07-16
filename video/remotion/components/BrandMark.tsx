import { videoFonts, videoTheme } from "../theme";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const markWidth = compact ? 64 : 104;
  const markHeight = compact ? 48 : 78;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 16 : 26 }}>
      <div style={{ width: markWidth, height: markHeight, position: "relative", flex: "0 0 auto" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: videoTheme.blue,
            clipPath: "polygon(0 100%, 22% 0, 50% 0, 28% 100%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#dce5ef",
            clipPath: "polygon(25% 0, 52% 0, 82% 100%, 55% 100%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: videoTheme.white,
            clipPath: "polygon(72% 0, 100% 0, 78% 100%, 50% 100%)"
          }}
        />
      </div>
      <div style={{ fontFamily: videoFonts.sans, color: videoTheme.white }}>
        <div style={{ fontSize: compact ? 30 : 52, lineHeight: 1, fontWeight: 650 }}>NUXTON</div>
        <div style={{ marginTop: compact ? 5 : 8, fontSize: compact ? 13 : 20, color: videoTheme.muted }}>
          Technology &amp; Innovation Consulting
        </div>
      </div>
    </div>
  );
}
