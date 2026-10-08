"use client";
import type { Field, FieldType, SavedValues } from "@/lib/types";
import { FIELD_TYPE_LABELS, isEdited, labelKey } from "@/lib/types";
import { DEFAULT_FONT, FONTS, type FontKey } from "@/lib/fonts";

interface Props {
  fields: Field[];
  selected: Field | null;
  savedValues: SavedValues;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Field>) => void;
  onDelete: (id: string) => void;
  onSaveValue: (label: string, value: string) => void;
  onDeleteValue: (label: string, value: string) => void;
}

export default function FieldPanel({ fields, selected, savedValues, onSelect, onChange, onDelete, onSaveValue, onDeleteValue }: Props) {
  if (!selected) {
    return (
      <div className="flex h-full flex-col">
        <h2 className="panel-title">Champs détectés ({fields.length})</h2>
        <p className="mb-3 text-xs text-gray-500">Clique sur une zone du document ou sur un champ ci-dessous. Double-clic pour éditer directement, glisser pour déplacer.</p>
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {fields.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onSelect(f.id)}
                className="flex w-full items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="truncate">
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-2 text-gray-500">{f.value}</span>
                </span>
                {isEdited(f) && <span className="ml-2 shrink-0 rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">modifié</span>}
              </button>
            </li>
          ))}
          {!fields.length && <li className="text-sm text-gray-500">Aucun champ. Utilise « Ajouter une zone » pour en créer.</li>}
        </ul>
      </div>
    );
  }

  const saved = savedValues[labelKey(selected.label)] ?? [];
  const savedByType = selected.type !== "text" ? savedValues[labelKey(FIELD_TYPE_LABELS[selected.type])] ?? [] : [];
  const all = Array.from(new Set([...saved, ...savedByType]));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="panel-title !mb-0">Champ sélectionné</h2>
        <button onClick={() => onSelect(null)} className="text-xs text-blue-600 hover:underline">
          ← tous les champs
        </button>
      </div>

      <label className="label">
        Nom
        <input className="input" value={selected.label} onChange={(e) => onChange(selected.id, { label: e.target.value })} />
      </label>

      <label className="label">
        Type
        <select className="input" value={selected.type} onChange={(e) => onChange(selected.id, { type: e.target.value as FieldType })}>
          {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className="label">
        Valeur
        <input
          className="input"
          autoFocus
          value={selected.value}
          onChange={(e) => onChange(selected.id, { value: e.target.value })}
          placeholder={selected.original}
        />
        <span className="text-[11px] text-gray-500">Original : {selected.original || "—"}</span>
      </label>

      <label className="label">
        Police
        <select className="input" value={selected.font ?? DEFAULT_FONT} onChange={(e) => onChange(selected.id, { font: e.target.value as FontKey })}>
          {(Object.keys(FONTS) as FontKey[]).map((k) => (
            <option key={k} value={k}>
              {FONTS[k].label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className="label flex-1">
          Taille du texte
          <input
            className="input"
            type="number"
            min={4}
            max={200}
            step={0.5}
            value={Math.round(selected.fontSize * 10) / 10}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v) && v > 0) onChange(selected.id, { fontSize: v });
            }}
          />
        </label>
        <label className="label flex-1">
          Style
          <span className="flex h-[34px] items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={!!selected.bold} onChange={(e) => onChange(selected.id, { bold: e.target.checked })} /> Gras
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!selected.value.trim()} onClick={() => onSaveValue(selected.label, selected.value)}>
          Enregistrer cette valeur
        </button>
        <button className="btn" disabled={selected.value === selected.original} onClick={() => onChange(selected.id, { value: selected.original })}>
          Rétablir
        </button>
        <button className="btn text-red-600" onClick={() => onDelete(selected.id)}>
          Supprimer la zone
        </button>
      </div>

      <div className="mt-2 flex-1 overflow-y-auto">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Valeurs enregistrées</h3>
        {all.length ? (
          <ul className="space-y-1">
            {all.map((v) => (
              <li key={v} className="flex items-center gap-1">
                <button
                  onClick={() => onChange(selected.id, { value: v })}
                  className={`flex-1 truncate rounded-md border px-3 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50 ${
                    v === selected.value ? "border-blue-500 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  • {v}
                </button>
                <button title="Supprimer" onClick={() => onDeleteValue(selected.label, v)} className="px-1 text-gray-400 hover:text-red-600">
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Aucune valeur enregistrée pour « {selected.label} ».</p>
        )}
      </div>
    </div>
  );
}
