"use client";
import type { SavedDoc } from "@/lib/types";

interface Props {
  documents: SavedDoc[];
  currentId: string | null;
  onOpen: (d: SavedDoc) => void;
  onDelete: (id: string) => void;
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function DocumentsPanel({ documents, currentId, onOpen, onDelete }: Props) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="panel-title">Mes documents</h2>
      <p className="mb-2 text-xs text-gray-500">Chaque document ouvert est sauvegardé automatiquement avec ses modifications. Tu peux le rouvrir et continuer.</p>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {documents.map((d) => {
          const edited = d.fields.filter((f) => f.value !== f.original).length;
          return (
            <li key={d.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${d.id === currentId ? "border-blue-400 bg-blue-50" : "border-gray-200"}`}>
              <div className="min-w-0">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-gray-500">
                  {formatDate(d.updatedAt)} · {edited} modif.
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-primary !px-2 !py-1 text-xs" disabled={d.id === currentId} onClick={() => onOpen(d)}>Ouvrir</button>
                <button className="btn !px-2 !py-1 text-xs text-red-600" onClick={() => onDelete(d.id)}>×</button>
              </div>
            </li>
          );
        })}
        {!documents.length && <li className="text-sm text-gray-500">Aucun document enregistré.</li>}
      </ul>
    </div>
  );
}
