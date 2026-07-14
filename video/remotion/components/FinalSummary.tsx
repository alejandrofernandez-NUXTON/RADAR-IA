import { BulletList } from "./BulletList";

export function FinalSummary({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div style={{ width: "100%", height: "100%", backgroundColor: "#172025", color: "white", padding: "110px 150px", position: "relative" }}>
      <div style={{ color: "#59d19c", fontSize: 29, fontWeight: 720, textTransform: "uppercase" }}>Conclusion ejecutiva</div>
      <div style={{ marginTop: 30, fontSize: 78, fontWeight: 750, lineHeight: 1.05, maxWidth: 1300 }}>{title}</div>
      <div style={{ marginTop: 24, maxWidth: 1300 }}>
        <div style={{ filter: "brightness(2.4)" }}><BulletList bullets={bullets} /></div>
      </div>
      <div style={{ position: "absolute", right: 115, bottom: 90, color: "#aab5b9", fontSize: 27 }}>Nuxton Knowledge Platform</div>
    </div>
  );
}
