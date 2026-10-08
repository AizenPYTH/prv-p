export type FieldType =
  | "date"
  | "amount"
  | "name"
  | "address"
  | "iban"
  | "bic"
  | "reference"
  | "invoice_number"
  | "phone"
  | "email"
  | "siren"
  | "percent"
  | "text";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  date: "Date",
  amount: "Montant",
  name: "Nom",
  address: "Adresse",
  iban: "IBAN",
  bic: "BIC",
  reference: "Référence",
  invoice_number: "Numéro de facture",
  phone: "Téléphone",
  email: "Email",
  siren: "SIREN / SIRET",
  percent: "Pourcentage",
  text: "Texte",
};

/** A text segment detected on a page (one visual line or run of text). Units are document units (PDF points or image pixels), origin top-left. */
export interface TextSegment {
  id: string;
  page: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** font size in document units */
  fontSize: number;
  bold?: boolean;
}

export interface Field {
  id: string;
  page: number;
  label: string;
  type: FieldType;
  /** Original text found at this position */
  original: string;
  /** Current value (equals original until edited) */
  value: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  bold?: boolean;
  /** Background colour sampled from the rendered page, as CSS hex */
  bg: string;
  /** Source text segment, used to avoid duplicating zones */
  segmentId?: string;
  /** True for zones created from text that no rule classified (plain editable text) */
  generic?: boolean;
}

export interface PageModel {
  index: number;
  /** width/height in document units */
  width: number;
  height: number;
  /** Rendered page as a data URL */
  imageUrl: string;
}

export interface DocModel {
  id: string;
  name: string;
  kind: "pdf" | "image";
  mime: string;
  /** Original file as a data URL (kept for export and templates) */
  dataUrl: string;
  pages: PageModel[];
  fields: Field[];
}

export interface Contact {
  id: string;
  kind: "contact" | "company";
  name: string;
  address?: string;
  iban?: string;
  bank?: string;
  email?: string;
  phone?: string;
  siren?: string;
}

export interface Template {
  id: string;
  name: string;
  createdAt: number;
  kind: "pdf" | "image";
  mime: string;
  dataUrl: string;
  fields: Field[];
  /** page sizes in document units, used to validate the template */
  pages: { width: number; height: number }[];
}

/** A document being worked on, auto-saved so it can be reopened and edited again. */
export interface SavedDoc {
  id: string;
  name: string;
  updatedAt: number;
  kind: "pdf" | "image";
  mime: string;
  dataUrl: string;
  fields: Field[];
  pages: { width: number; height: number }[];
}

export type SavedValues = Record<string, string[]>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Normalises a label so that "Bénéficiaire :" and "beneficiaire" share saved values. */
export function labelKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
