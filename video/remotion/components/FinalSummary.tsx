import { BrandMark } from "./BrandMark";
import { BulletList } from "./BulletList";
import { NetworkGraphic } from "./NetworkGraphic";
import { videoFonts, videoTheme } from "../theme";

export function FinalSummary({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: videoTheme.background, color: videoTheme.white, padding: "64px 82px", position: "relative", overflow: "hidden", fontFamily: videoFonts.sans }}>
      <BrandMark compact />
      <div style={{ position: "absolute", left: 82, top: 245, width: 1080 }}>
        <div style={{ color: videoTheme.cyan, fontSize: 23, fontWeight: 700, textTransform: "uppercase" }}>Decisiones del dia</div>
        <div style={{ marginTop: 22, fontFamily: videoFonts.display, fontSize: 78, fontWeight: 400, lineHeight: 1.04, maxWidth: 1050 }}>{title}</div>
        <div style={{ marginTop: 25, width: 112, height: 4, backgroundColor: videoTheme.blue }} />
        <div style={{ marginTop: 4, maxWidth: 1000 }}><BulletList bullets={bullets} /></div>
      </div>
      <div style={{ position: "absolute", right: -65, top: 150, opacity: 0.92 }}><NetworkGraphic size={700} label="NEXT" /></div>
      <div style={{ position: "absolute", right: 82, bottom: 46, color: videoTheme.muted, fontSize: 19 }}>Nuxton Knowledge Platform</div>
    </div>
  );
}
