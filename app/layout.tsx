import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar IA",
  description: "Radar interno de noticias y formaciones gratuitas de inteligencia artificial."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
