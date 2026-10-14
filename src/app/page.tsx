import Link from "next/link";

/** Site hub: one tile per project. Add a tile here when a new project joins the site. */
const PROJECTS = [
  {
    href: "/editor",
    title: "Smart Document Editor",
    description: "Importer un PDF ou une image, détecter les champs, modifier, exporter en PDF.",
    tag: "Documents",
  },
  {
    href: "/amaz",
    title: "Amaz · Générateur de factures",
    description: "Un assistant pose les questions une par une et produit la facture en PDF.",
    tag: "Factures",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Mes outils</h1>
        <p className="mt-2 text-gray-500">Choisis un projet.</p>
      </div>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-3">
        {PROJECTS.map((p) => (
          <Link key={p.href} href={p.href} className="group flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md">
            <span className="w-fit rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">{p.tag}</span>
            <span className="text-lg font-semibold group-hover:text-blue-700">{p.title}</span>
            <span className="text-sm text-gray-500">{p.description}</span>
            <span className="mt-auto pt-2 text-sm font-medium text-blue-600">Ouvrir →</span>
          </Link>
        ))}
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center text-gray-400">
          <span className="text-lg font-semibold">Projet 3</span>
          <span className="text-sm">Bientôt</span>
        </div>
      </div>
    </main>
  );
}
