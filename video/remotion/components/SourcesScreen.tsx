import type { VideoScript } from "../../schemas/video-script-schema";
import { BrandMark } from "./BrandMark";
import { NetworkGraphic } from "./NetworkGraphic";
import { videoFonts, videoTheme } from "../theme";

export function SourcesScreen({ sources }: { sources: VideoScript["sources"] }) {
  const fontSize = sources.length > 8 ? 20 : sources.length > 5 ? 23 : 28;
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: videoTheme.background, color: videoTheme.white, padding: "64px 82px", position: "relative", overflow: "hidden", fontFamily: videoFonts.sans }}>
      <BrandMark compact />
      <div style={{ position: "absolute", left: 82, top: 230, width: 1180 }}>
        <div style={{ color: videoTheme.cyan, fontSize: 22, fontWeight: 700, textTransform: "uppercase" }}>Trazabilidad</div>
        <div style={{ marginTop: 18, fontFamily: videoFonts.display, fontSize: 72, fontWeight: 400 }}>Fuentes originales</div>
        <div style={{ marginTop: 26, width: 110, height: 4, backgroundColor: videoTheme.blue }} />
        <div style={{ marginTop: 42, display: "grid", gridTemplateColumns: sources.length > 5 ? "1fr 1fr" : "1fr", columnGap: 58, rowGap: 22, maxWidth: 1120 }}>
          {sources.map((source, index) => (
            <div key={`${source.newsItemId}-${index}`} style={{ borderTop: `1px solid ${videoTheme.line}`, paddingTop: 14, minWidth: 0 }}>
              <div style={{ color: videoTheme.cyan, fontSize: 17, fontWeight: 700 }}>{source.name}</div>
              <div style={{ marginTop: 6, fontSize, lineHeight: 1.2, fontWeight: 500 }}>{source.title}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", right: -190, top: 190, opacity: 0.45 }}><NetworkGraphic size={640} label="SOURCES" /></div>
    </div>
  );
}
