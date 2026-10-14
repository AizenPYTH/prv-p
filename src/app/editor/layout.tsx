import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Document Editor",
  description: "Importer, détecter, modifier et exporter des documents administratifs.",
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
