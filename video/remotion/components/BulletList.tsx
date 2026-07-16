import { interpolate, useCurrentFrame } from "remotion";
import { videoFonts, videoTheme } from "../theme";

function bulletParts(bullet: string, index: number) {
  const match = bullet.match(/^([^:]{2,24}):\s*(.+)$/);
  if (match) return { label: match[1], text: match[2] };
  return { label: ["Clave", "Impacto", "Accion"][index] || "Clave", text: bullet };
}

export function BulletList({ bullets }: { bullets: string[] }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 34, fontFamily: videoFonts.sans }}>
      {bullets.slice(0, 3).map((bullet, index) => {
        const parts = bulletParts(bullet, index);
        const opacity = interpolate(frame, [10 + index * 8, 20 + index * 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        const translateY = interpolate(frame, [10 + index * 8, 20 + index * 8], [20, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        return (
          <div key={`${index}-${bullet}`} style={{ display: "flex", gap: 18, opacity, transform: `translateY(${translateY}px)`, alignItems: "flex-start" }}>
            <div style={{ width: 8, height: 54, marginTop: 3, backgroundColor: index === 0 ? videoTheme.blue : index === 1 ? videoTheme.cyan : videoTheme.white, opacity: index === 2 ? 0.72 : 1 }} />
            <div style={{ maxWidth: 930 }}>
              <div style={{ color: videoTheme.cyan, fontSize: 18, lineHeight: 1.2, fontWeight: 700, textTransform: "uppercase" }}>{parts.label}</div>
              <div style={{ marginTop: 5, color: videoTheme.white, fontSize: 31, lineHeight: 1.25, fontWeight: 520 }}>{parts.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
