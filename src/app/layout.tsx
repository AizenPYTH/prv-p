import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mes outils",
  description: "Smart Document Editor, Amaz et les prochains projets, sur un seul site.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
