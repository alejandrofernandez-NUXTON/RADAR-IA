import { Bot, Database, Mail, MessageCircle, Smartphone, Workflow } from "lucide-react";
import { interpolate, useCurrentFrame } from "remotion";
import { videoFonts, videoTheme } from "../theme";

const nodes = [
  { angle: -88, distance: 275, Icon: MessageCircle },
  { angle: -153, distance: 255, Icon: Mail },
  { angle: 142, distance: 255, Icon: Workflow },
  { angle: 90, distance: 280, Icon: Smartphone },
  { angle: 28, distance: 250, Icon: Database },
  { angle: -28, distance: 245, Icon: Bot }
];

const fieldDots = Array.from({ length: 54 }, (_, index) => ({
  left: 8 + ((index * 37) % 84),
  top: 8 + ((index * 53) % 84),
  size: index % 7 === 0 ? 5 : 3,
  opacity: 0.18 + (index % 5) * 0.07
}));

export function NetworkGraphic({ label = "AI", size = 720 }: { label?: string; size?: number }) {
  const frame = useCurrentFrame();
  const center = size / 2;
  const scale = size / 720;
  const pulse = interpolate(Math.sin(frame / 16), [-1, 1], [0.72, 1]);

  return (
    <div style={{ position: "relative", width: size, height: size, overflow: "hidden" }}>
      {fieldDots.map((dot, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: `${dot.left}%`,
            top: `${dot.top}%`,
            width: dot.size,
            height: dot.size,
            borderRadius: "50%",
            backgroundColor: videoTheme.cyan,
            opacity: dot.opacity
          }}
        />
      ))}

      {nodes.map(({ angle, distance }) => (
        <div
          key={`line-${angle}`}
          style={{
            position: "absolute",
            left: center,
            top: center,
            width: distance * scale,
            height: 2,
            transformOrigin: "left center",
            transform: `rotate(${angle}deg)`,
            backgroundColor: videoTheme.line
          }}
        />
      ))}

      {[250, 194, 142].map((diameter, index) => (
        <div
          key={diameter}
          style={{
            position: "absolute",
            left: center - (diameter * scale) / 2,
            top: center - (diameter * scale) / 2,
            width: diameter * scale,
            height: diameter * scale,
            borderRadius: "50%",
            border: `${index === 0 ? 2 : 1}px solid ${index === 0 ? videoTheme.lineStrong : videoTheme.line}`,
            opacity: index === 0 ? pulse : 0.78
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: center - 79 * scale,
          top: center - 79 * scale,
          width: 158 * scale,
          height: 158 * scale,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: videoTheme.white,
          border: `2px solid ${videoTheme.cyan}`,
          backgroundColor: "rgba(4, 17, 31, 0.88)",
          boxShadow: `0 0 48px rgba(22, 136, 255, ${0.2 * pulse})`,
          fontFamily: videoFonts.sans,
          fontSize: label.length > 5 ? 28 * scale : 52 * scale,
          fontWeight: 650
        }}
      >
        {label}
      </div>

      {nodes.map(({ angle, distance, Icon }, index) => {
        const radians = (angle * Math.PI) / 180;
        const x = center + Math.cos(radians) * distance * scale;
        const y = center + Math.sin(radians) * distance * scale;
        const nodeSize = 76 * scale;
        return (
          <div
            key={`node-${angle}`}
            style={{
              position: "absolute",
              left: x - nodeSize / 2,
              top: y - nodeSize / 2,
              width: nodeSize,
              height: nodeSize,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: index === 0 ? videoTheme.white : videoTheme.cyan,
              border: `2px solid ${index === 0 ? videoTheme.cyan : videoTheme.lineStrong}`,
              backgroundColor: "rgba(4, 17, 31, 0.9)",
              boxShadow: "0 0 18px rgba(22, 136, 255, 0.22)"
            }}
          >
            <Icon size={34 * scale} strokeWidth={1.6} />
          </div>
        );
      })}
    </div>
  );
}
