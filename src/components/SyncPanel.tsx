"use client";
import { useEffect, useRef, useState } from "react";
import type { Contact, SavedDoc, SavedValues, Template } from "@/lib/types";
import { cloudAvailable, downloadBackup, loadSyncCode, pullAll, pushAll, readBackup, saveSyncCode } from "@/lib/sync";

export interface LibraryData {
  documents: SavedDoc[];
  templates: Template[];
  contacts: Contact[];
  values: SavedValues;
}

interface Props {
  data: LibraryData;
  onRestore: (data: LibraryData) => Promise<void>;
}

export default function SyncPanel({ data, onRestore }: Props) {
  const [cloud, setCloud] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void cloudAvailable().then(setCloud);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(loadSyncCode());
  }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
    } catch (e) {
      setStatus("Erreur : " + (e instanceof Error ? e.message : String(e)));
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const counts = `${data.documents.length} document(s), ${data.templates.length} modèle(s), ${data.contacts.length} contact(s)`;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      <div>
        <h2 className="panel-title">Sauvegarde fichier</h2>
        <p className="mb-2 text-xs text-gray-500">Télécharge tout ({counts}) dans un fichier, puis importe-le sur un autre ordinateur. Marche sans configuration.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => downloadBackup(data)}>
            Exporter tout (.json)
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void run("Import en cours…", async () => {
                const d = await readBackup(f);
                await onRestore(d);
                setStatus(`Importé : ${d.documents.length} document(s), ${d.templates.length} modèle(s), ${d.contacts.length} contact(s).`);
              });
            }}
          />
          <button className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
            Importer un fichier
          </button>
        </div>
      </div>

      <div>
        <h2 className="panel-title">Synchronisation cloud</h2>
        {cloud === null && <p className="text-xs text-gray-500">Vérification…</p>}
        {cloud === false && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Non configurée. Sur Vercel : onglet <b>Storage</b> → <b>Create Database</b> → <b>Blob</b> → connecter au projet, puis redéployer. La variable <code>BLOB_READ_WRITE_TOKEN</code> est ajoutée automatiquement.
          </div>
        )}
        {cloud && (
          <>
            <p className="mb-2 text-xs text-gray-500">
              Choisis un code secret (comme un mot de passe) et utilise le même sur chaque ordinateur. Tes fichiers sont rangés dans un espace lié à ce code.
            </p>
            <label className="label mb-2">
              Code de synchronisation
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder="ex. mon-code-secret-2026"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  saveSyncCode(e.target.value);
                }}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={busy || code.trim().length < 6}
                onClick={() =>
                  void run("Envoi…", async () => {
                    await pushAll(code, data, setStatus);
                    setStatus(`Envoyé : ${counts}.`);
                  })
                }
              >
                Envoyer vers le cloud
              </button>
              <button
                className="btn"
                disabled={busy || code.trim().length < 6}
                onClick={() =>
                  void run("Réception…", async () => {
                    const d = await pullAll(code, setStatus);
                    await onRestore(d);
                    setStatus(`Récupéré : ${d.documents.length} document(s), ${d.templates.length} modèle(s), ${d.contacts.length} contact(s).`);
                  })
                }
              >
                Récupérer depuis le cloud
              </button>
            </div>
            {code.trim().length > 0 && code.trim().length < 6 && <p className="mt-1 text-xs text-red-600">6 caractères minimum.</p>}
          </>
        )}
      </div>

      {status && <p className="text-sm text-blue-700">{status}</p>}
    </div>
  );
}
