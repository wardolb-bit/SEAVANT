import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEAVANT",
  description: "Maritime Operations Platform by Ward Maritime"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
