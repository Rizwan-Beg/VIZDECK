import type { Metadata } from "next";
import "./globals.css";
import "./reconstruction.css";

export const metadata: Metadata = {
  title: "VIZDECK — AI-Powered Rug & Carpet Visualisation",
  description: "Let customers upload a room, select a rug and see it in their own space before they buy.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
