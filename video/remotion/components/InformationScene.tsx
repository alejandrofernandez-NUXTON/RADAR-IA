import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BrandMark } from "./BrandMark";
import { BulletList } from "./BulletList";
import { NetworkGraphic } from "./NetworkGraphic";
import { SourceBadge } from "./SourceBadge";
import { videoFonts, videoTheme } from "../theme";

export function InformationScene({
  title,
  bullets,
  sourceLabel,
  imageFile,
  index,
  total
}: {
  title: string;
  bullets: string[];
  sourceLabel?: string;
  imageFile?: string;
  index: number;
  total: number;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const imageScale = interpolate(frame, [0, 180], [1.04, 1], { extrapolateRight: "clamp" });
  const titleSize = title.length > 95 ? 51 : title.length > 68 ? 58 : 66;
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: videoTheme.background, color: videoTheme.white, padding: "58px 76px 105px", position: "relative", overflow: "hidden", fontFamily: videoFonts.sans }}>
      <BrandMark compact />
      <div style={{ position: "absolute", left: 76, top: 202, width: 1020, bottom: 96, display: "flex", flexDirection: "column", opacity }}>
        <div style={{ color: videoTheme.cyan, fontSize: 21, fontWeight: 700, textTransform: "uppercase" }}>Radar IA · {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}</div>
        <div style={{ marginTop: 19, fontFamily: videoFonts.display, fontSize: titleSize, lineHeight: 1.06, fontWeight: 400, maxWidth: 990 }}>{title}</div>
        <div style={{ marginTop: 22, width: 104, height: 4, backgroundColor: videoTheme.blue }} />
        <BulletList bullets={bullets} />
        <div style={{ marginTop: "auto", paddingTop: 20 }}><SourceBadge label={sourceLabel} /></div>
      </div>
      <div style={{ position: "absolute", right: -70, top: 130, width: 850, height: 740, overflow: "hidden" }}>
        {imageFile ? (
          <Img src={staticFile(imageFile)} style={{ position: "absolute", left: 120, top: 110, width: 610, height: 430, objectFit: "cover", transform: `scale(${imageScale})`, opacity: 0.38, filter: "saturate(0.78) contrast(1.12) brightness(0.72)" }} />
        ) : null}
        <div style={{ position: "absolute", right: -65, top: -30, opacity: imageFile ? 0.88 : 1 }}>
          <NetworkGraphic size={690} label="AI" />
        </div>
      </div>
      <div style={{ position: "absolute", right: 54, bottom: 42, color: videoTheme.muted, fontSize: 17 }}>Nuxton Knowledge Platform</div>
    </div>
  );
}
