export function SourceBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#5d6970", fontSize: 25, fontWeight: 600 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#16a167" }} />
      Fuente: {label}
    </div>
  );
}
