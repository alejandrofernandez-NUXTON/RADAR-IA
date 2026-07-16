import { videoFonts, videoTheme } from "../theme";

export function Captions({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div style={{ position: "absolute", left: 210, right: 210, top: 930, display: "flex", justifyContent: "center", fontFamily: videoFonts.sans }}>
      <div style={{ maxWidth: 1320, backgroundColor: "rgba(2, 11, 20, 0.94)", color: videoTheme.white, borderTop: `3px solid ${videoTheme.blue}`, padding: "13px 24px", fontSize: 27, lineHeight: 1.28, textAlign: "center", boxShadow: "0 12px 35px rgba(0, 0, 0, 0.32)" }}>
        {text}
      </div>
    </div>
  );
}
