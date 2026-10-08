import type { Contact, SavedValues, Template } from "./types";

const KEYS = {
  values: "sde:values",
  contacts: "sde:contacts",
  templates: "sde:templates",
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

export const storage = {
  loadValues: (): SavedValues => read<SavedValues>(KEYS.values, {}),
  saveValues: (v: SavedValues) => write(KEYS.values, v),
  loadContacts: (): Contact[] => read<Contact[]>(KEYS.contacts, []),
  saveContacts: (c: Contact[]) => write(KEYS.contacts, c),
  loadTemplates: (): Template[] => read<Template[]>(KEYS.templates, []),
  /** Returns false when the browser quota is exceeded (large files). */
  saveTemplates: (t: Template[]) => write(KEYS.templates, t),
};
