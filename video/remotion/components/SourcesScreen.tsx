import type { VideoScript } from "../../schemas/video-script-schema";

export function SourcesScreen({ sources }: { sources: VideoScript["sources"] }) {
  const fontSize = sources.length > 8 ? 22 : sources.length > 5 ? 26 : 30;
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#f4f7f5", color: "#172025", padding: "90px 130px" }}>
      <div style={{ color: "#16a167", fontSize: 26, fontWeight: 730, textTransform: "uppercase" }}>Referencias originales</div>
      <div style={{ marginTop: 18, fontSize: 70, fontWeight: 750 }}>Fuentes</div>
      <div style={{ marginTop: 42, display: "grid", gridTemplateColumns: sources.length > 5 ? "1fr 1fr" : "1fr", columnGap: 70, rowGap: 20 }}>
        {sources.map((source, index) => (
          <div key={`${source.newsItemId}-${index}`} style={{ borderTop: "2px solid #d8dfdc", paddingTop: 14, minWidth: 0 }}>
            <div style={{ color: "#16a167", fontSize: 20, fontWeight: 700 }}>{source.name}</div>
            <div style={{ marginTop: 5, fontSize, lineHeight: 1.2, fontWeight: 580 }}>{source.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
