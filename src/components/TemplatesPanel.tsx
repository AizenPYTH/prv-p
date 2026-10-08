"use client";
import type { Template } from "@/lib/types";

interface Props {
  templates: Template[];
  onOpen: (t: Template) => void;
  onDelete: (id: string) => void;
  onSaveCurrent: () => void;
  canSave: boolean;
}

export default function TemplatesPanel({ templates, onOpen, onDelete, onSaveCurrent, canSave }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="panel-title !mb-0">Modèles</h2>
        <button className="btn-primary" disabled={!canSave} onClick={onSaveCurrent}>Enregistrer le document actuel</button>
      </div>
      <p className="mb-2 text-xs text-gray-500">Un modèle conserve le document et ses zones déjà détectées et configurées.</p>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{t.name}</div>
              <div className="text-xs text-gray-500">
                {t.fields.length} champ(s) · {new Date(t.createdAt).toLocaleDateString("fr-FR")}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => onOpen(t)}>Ouvrir</button>
              <button className="btn !px-2 !py-1 text-xs text-red-600" onClick={() => onDelete(t.id)}>×</button>
            </div>
          </li>
        ))}
        {!templates.length && <li className="text-sm text-gray-500">Aucun modèle enregistré.</li>}
      </ul>
    </div>
  );
}
