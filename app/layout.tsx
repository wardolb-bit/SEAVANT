import type { Metadata, Viewport } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./voyage-builder.css";
import "./active-leg.css";
import "./watch-intelligence.css";

export const metadata: Metadata = {
  title: "SEAVANT",
  description: "Maritime Operations Platform by Ward Maritime"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071014"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
