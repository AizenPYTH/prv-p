import type { Contact, SavedDoc, SavedValues, Template } from "./types";
import { db } from "./db";

const KEYS = {
  values: "sde:values",
  contacts: "sde:contacts",
  templates: "sde:templates", // legacy localStorage location, migrated to IndexedDB
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const byDate = <T extends { updatedAt?: number; createdAt?: number }>(a: T, b: T) =>
  (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);

export const storage = {
  loadValues: (): SavedValues => read<SavedValues>(KEYS.values, {}),
  saveValues: (v: SavedValues) => write(KEYS.values, v),
  loadContacts: (): Contact[] => read<Contact[]>(KEYS.contacts, []),
  saveContacts: (c: Contact[]) => write(KEYS.contacts, c),

  async loadTemplates(): Promise<Template[]> {
    const legacy = read<Template[]>(KEYS.templates, []);
    if (legacy.length) {
      for (const t of legacy) await db.put("templates", t);
      window.localStorage.removeItem(KEYS.templates);
    }
    return (await db.getAll<Template>("templates")).sort(byDate);
  },
  putTemplate: (t: Template) => db.put("templates", t),
  deleteTemplate: (id: string) => db.delete("templates", id),

  loadDocuments: async (): Promise<SavedDoc[]> => (await db.getAll<SavedDoc>("documents")).sort(byDate),
  putDocument: (d: SavedDoc) => db.put("documents", d),
  deleteDocument: (id: string) => db.delete("documents", id),
};
