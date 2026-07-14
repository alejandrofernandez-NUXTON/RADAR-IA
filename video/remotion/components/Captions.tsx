export function Captions({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div style={{ position: "absolute", left: 210, right: 210, bottom: 52, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 1320, backgroundColor: "rgba(18, 24, 27, 0.92)", color: "#ffffff", padding: "14px 24px", fontSize: 29, lineHeight: 1.3, textAlign: "center" }}>
        {text}
      </div>
    </div>
  );
}
