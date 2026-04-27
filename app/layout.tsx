import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YT → MP3 • Converter",
  description:
    "Modern, minimalist YouTube → MP3 converter (educational demo with ytdl-core + ffmpeg).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" className="dark">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
