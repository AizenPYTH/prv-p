"use client";
import { upload } from "@vercel/blob/client";
import type { Contact, SavedDoc, SavedValues, Template } from "./types";

export interface Backup {
  version: 1;
  exportedAt: number;
  documents: SavedDoc[];
  templates: Template[];
  contacts: Contact[];
  values: SavedValues;
}

const CODE_KEY = "sde:syncCode";
export const loadSyncCode = () => (typeof window === "undefined" ? "" : window.localStorage.getItem(CODE_KEY) ?? "");
export const saveSyncCode = (code: string) => window.localStorage.setItem(CODE_KEY, code);

export async function syncHash(code: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim()));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function cloudAvailable(): Promise<boolean> {
  try {
    const r = await fetch("/api/sync");
    return Boolean(((await r.json()) as { available?: boolean }).available);
  } catch {
    return false;
  }
}

async function putJson(pathname: string, data: unknown) {
  await upload(pathname, new Blob([JSON.stringify(data)], { type: "application/json" }), {
    access: "private",
    handleUploadUrl: "/api/sync",
    contentType: "application/json",
  });
}

/** Uploads every document, template and the library to the user's space. */
export async function pushAll(code: string, data: Omit<Backup, "version" | "exportedAt">, onProgress?: (msg: string) => void) {
  const h = await syncHash(code);
  const items = [
    ...data.documents.map((d) => ({ path: `spaces/${h}/documents/${d.id}.json`, data: d, label: d.name })),
    ...data.templates.map((t) => ({ path: `spaces/${h}/templates/${t.id}.json`, data: t, label: t.name })),
  ];
  let n = 0;
  for (const it of items) {
    onProgress?.(`Envoi ${++n}/${items.length + 1} : ${it.label}`);
    await putJson(it.path, it.data);
  }
  onProgress?.(`Envoi ${items.length + 1}/${items.length + 1} : contacts et valeurs`);
  await putJson(`spaces/${h}/library.json`, { contacts: data.contacts, values: data.values });
}

/** Downloads everything stored in the user's space. */
export async function pullAll(code: string, onProgress?: (msg: string) => void): Promise<Omit<Backup, "version" | "exportedAt">> {
  const h = await syncHash(code);
  const res = await fetch(`/api/sync?prefix=${encodeURIComponent(`spaces/${h}/`)}`);
  const json = (await res.json()) as { blobs?: { pathname: string }[]; error?: string };
  if (!res.ok || !json.blobs) throw new Error(json.error ?? "Liste impossible");
  const out: Omit<Backup, "version" | "exportedAt"> = { documents: [], templates: [], contacts: [], values: {} };
  let n = 0;
  for (const b of json.blobs) {
    onProgress?.(`Réception ${++n}/${json.blobs.length}`);
    const r = await fetch(`/api/sync?path=${encodeURIComponent(b.pathname)}`);
    if (!r.ok) continue;
    const data = await r.json();
    if (b.pathname.includes("/documents/")) out.documents.push(data as SavedDoc);
    else if (b.pathname.includes("/templates/")) out.templates.push(data as Template);
    else if (b.pathname.endsWith("/library.json")) {
      const lib = data as { contacts?: Contact[]; values?: SavedValues };
      out.contacts = lib.contacts ?? [];
      out.values = lib.values ?? {};
    }
  }
  return out;
}

export async function removeRemote(code: string, kind: "documents" | "templates", id: string) {
  const h = await syncHash(code);
  await fetch(`/api/sync?path=${encodeURIComponent(`spaces/${h}/${kind}/${id}.json`)}`, { method: "DELETE" });
}

/* ---------- file backup ---------- */

export function downloadBackup(data: Omit<Backup, "version" | "exportedAt">) {
  const backup: Backup = { version: 1, exportedAt: Date.now(), ...data };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `smart-document-editor-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackup(file: File): Promise<Omit<Backup, "version" | "exportedAt">> {
  const parsed = JSON.parse(await file.text()) as Partial<Backup>;
  if (!parsed || typeof parsed !== "object") throw new Error("Fichier de sauvegarde invalide");
  return {
    documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    templates: Array.isArray(parsed.templates) ? parsed.templates : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    values: parsed.values && typeof parsed.values === "object" ? parsed.values : {},
  };
}
