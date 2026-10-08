"use client";
import { useState } from "react";
import type { Contact } from "@/lib/types";
import { uid } from "@/lib/types";

interface Props {
  contacts: Contact[];
  onChange: (contacts: Contact[]) => void;
  onApply: (contact: Contact) => void;
  canApply: boolean;
}

const EMPTY: Omit<Contact, "id"> = { kind: "contact", name: "", address: "", iban: "", bank: "", email: "", phone: "", siren: "" };

export default function ContactsPanel({ contacts, onChange, onApply, canApply }: Props) {
  const [editing, setEditing] = useState<Contact | null>(null);

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    const exists = contacts.some((c) => c.id === editing.id);
    onChange(exists ? contacts.map((c) => (c.id === editing.id ? editing : c)) : [...contacts, editing]);
    setEditing(null);
  };

  if (editing) {
    const set = (patch: Partial<Contact>) => setEditing({ ...editing, ...patch });
    const isCompany = editing.kind === "company";
    return (
      <div className="flex h-full flex-col gap-2 overflow-y-auto">
        <h2 className="panel-title">{isCompany ? "Entreprise" : "Contact"}</h2>
        <div className="flex gap-2 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" checked={!isCompany} onChange={() => set({ kind: "contact" })} /> Contact
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={isCompany} onChange={() => set({ kind: "company" })} /> Entreprise
          </label>
        </div>
        <label className="label">Nom<input className="input" value={editing.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="label">Adresse<input className="input" value={editing.address ?? ""} onChange={(e) => set({ address: e.target.value })} /></label>
        {isCompany ? (
          <label className="label">SIREN<input className="input" value={editing.siren ?? ""} onChange={(e) => set({ siren: e.target.value })} /></label>
        ) : (
          <>
            <label className="label">IBAN<input className="input" value={editing.iban ?? ""} onChange={(e) => set({ iban: e.target.value })} /></label>
            <label className="label">Banque<input className="input" value={editing.bank ?? ""} onChange={(e) => set({ bank: e.target.value })} /></label>
          </>
        )}
        <label className="label">Email<input className="input" value={editing.email ?? ""} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="label">Téléphone<input className="input" value={editing.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} /></label>
        <div className="mt-2 flex gap-2">
          <button className="btn-primary" onClick={save} disabled={!editing.name.trim()}>Enregistrer</button>
          <button className="btn" onClick={() => setEditing(null)}>Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="panel-title !mb-0">Contacts & entreprises</h2>
        <button className="btn-primary" onClick={() => setEditing({ id: uid("c"), ...EMPTY })}>+ Ajouter</button>
      </div>
      <p className="mb-2 text-xs text-gray-500">Sélectionne un contact pour remplir automatiquement les champs correspondants (nom, adresse, IBAN, email…).</p>
      <ul className="flex-1 space-y-1 overflow-y-auto">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-md border border-gray-200 p-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {c.name} <span className="text-[10px] uppercase text-gray-400">{c.kind === "company" ? "entreprise" : "contact"}</span>
                </div>
                <div className="truncate text-xs text-gray-500">{[c.iban, c.email, c.phone, c.siren].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-primary !px-2 !py-1 text-xs" disabled={!canApply} onClick={() => onApply(c)}>Appliquer</button>
                <button className="btn !px-2 !py-1 text-xs" onClick={() => setEditing(c)}>✎</button>
                <button className="btn !px-2 !py-1 text-xs text-red-600" onClick={() => onChange(contacts.filter((x) => x.id !== c.id))}>×</button>
              </div>
            </div>
          </li>
        ))}
        {!contacts.length && <li className="text-sm text-gray-500">Aucun contact enregistré.</li>}
      </ul>
    </div>
  );
}
