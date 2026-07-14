import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BulletList } from "./BulletList";
import { SourceBadge } from "./SourceBadge";

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
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#f7f8f7", color: "#172025", padding: "84px 96px 115px", position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 72, height: "100%", opacity }}>
        <div style={{ flex: 1.18, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ color: "#16a167", fontSize: 25, fontWeight: 750, textTransform: "uppercase" }}>Noticia {index} de {total}</div>
          <div style={{ marginTop: 22, fontSize: title.length > 90 ? 54 : 64, lineHeight: 1.08, fontWeight: 750, maxWidth: 1050 }}>{title}</div>
          <BulletList bullets={bullets} />
          <div style={{ marginTop: "auto", paddingTop: 28 }}><SourceBadge label={sourceLabel} /></div>
        </div>
        <div style={{ flex: 0.82, minWidth: 0, position: "relative", backgroundColor: "#172025", overflow: "hidden" }}>
          {imageFile ? (
            <Img src={staticFile(imageFile)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${imageScale})`, opacity: 0.9 }} />
          ) : (
            <div style={{ width: "100%", height: "100%", position: "relative" }}>
              <div style={{ position: "absolute", width: 250, height: 250, left: 80, top: 100, backgroundColor: "#16a167" }} />
              <div style={{ position: "absolute", width: 175, height: 175, right: 70, top: 310, backgroundColor: "#e56b4a" }} />
              <div style={{ position: "absolute", width: 95, height: 310, left: 210, bottom: 75, backgroundColor: "#e8bd3f" }} />
              <div style={{ position: "absolute", left: 65, right: 65, bottom: 55, color: "#ffffff", fontSize: 27, fontWeight: 650 }}>Nuxton Knowledge Platform</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
