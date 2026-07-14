import { interpolate, useCurrentFrame } from "remotion";

export function BulletList({ bullets }: { bullets: string[] }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 34 }}>
      {bullets.slice(0, 3).map((bullet, index) => {
        const opacity = interpolate(frame, [10 + index * 8, 20 + index * 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        const translateY = interpolate(frame, [10 + index * 8, 20 + index * 8], [20, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        return (
          <div key={`${index}-${bullet}`} style={{ display: "flex", gap: 18, opacity, transform: `translateY(${translateY}px)` }}>
            <div style={{ width: 11, height: 11, marginTop: 15, backgroundColor: index === 0 ? "#16a167" : index === 1 ? "#e56b4a" : "#d3a21a" }} />
            <div style={{ color: "#263139", fontSize: 36, lineHeight: 1.28, fontWeight: 540, maxWidth: 930 }}>{bullet}</div>
          </div>
        );
      })}
    </div>
  );
}
