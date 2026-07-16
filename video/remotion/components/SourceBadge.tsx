import { videoTheme } from "../theme";

export function SourceBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: videoTheme.muted, fontSize: 21, fontWeight: 600 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: videoTheme.blue, boxShadow: "0 0 12px rgba(22, 136, 255, 0.7)" }} />
      Fuente: {label}
    </div>
  );
}
