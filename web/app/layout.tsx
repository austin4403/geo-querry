import type { Metadata } from "next";
import "./globals.css";
import { SkipToContent } from "@/components/ui/skip-to-content";

export const metadata: Metadata = {
  title: "GeoQuerry — Production Geological Survey Platform",
  description:
    "Enterprise mineral exploration and survey workstation supporting NI 43-101 and JORC compliance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <SkipToContent />
        {children}
      </body>
    </html>
  );
}
