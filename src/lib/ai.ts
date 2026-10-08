"use client";
import type { ChatMessage, Contact, Field, FieldType, SavedValues, TextSegment } from "./types";
import { FIELD_TYPE_LABELS, labelKey, uid } from "./types";
import { detectFields, finalizeFields, guessType } from "./detect";
import { textRange } from "./text";
import { guessFont } from "./fonts";

let aiStatus: Promise<boolean> | null = null;
/** True when the server has an Anthropic API key configured. */
export function aiAvailable(): Promise<boolean> {
  if (!aiStatus) {
    aiStatus = fetch("/api/status")
      .then((r) => r.json())
      .then((j) => Boolean(j.ai))
      .catch(() => false);
  }
  return aiStatus;
}

/**
 * Classifies segments. Uses Claude when configured, otherwise the local
 * heuristics. Claude's result is mapped back onto segment positions.
 */
export async function classifySegments(segments: TextSegment[]): Promise<{ fields: Field[]; source: "ai" | "heuristic" }> {
  const heuristic = detectFields(segments);
  if (!(await aiAvailable())) return { fields: heuristic, source: "heuristic" };
  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: segments.map((s) => ({ id: s.id, text: s.text, page: s.page })) }),
    });
    const json = (await res.json()) as { fields?: { id: string; label: string; type: FieldType; value: string }[] };
    if (!json.fields?.length) return { fields: heuristic, source: "heuristic" };
    const byId = new Map(segments.map((s) => [s.id, s]));
    const fields: Field[] = [];
    for (const f of json.fields) {
      const seg = byId.get(f.id);
      if (!seg) continue;
      const value = f.value?.trim() || seg.text;
      const start = Math.max(0, seg.text.indexOf(value));
      const end = start + value.length;
      const box = textRange(seg, start, end);
      fields.push({
        id: uid("f"),
        page: seg.page,
        label: f.label || FIELD_TYPE_LABELS[f.type] || "Champ",
        type: f.type in FIELD_TYPE_LABELS ? f.type : (guessType(value) ?? "text"),
        original: value,
        value,
        x: box.x,
        y: seg.y,
        w: Math.max(box.w, seg.fontSize),
        h: seg.h,
        fontSize: seg.fontSize,
        bold: seg.bold,
        bg: "#ffffff",
        segmentId: seg.id,
        font: guessFont(seg.fontName),
        ox: box.x,
        oy: seg.y,
      });
    }
    return { fields: finalizeFields(fields, segments), source: "ai" };
  } catch {
    return { fields: heuristic, source: "heuristic" };
  }
}

export interface AssistantResult {
  reply: string;
  updates: { id: string; value: string }[];
  applyContact: string | null;
}

/** Sends the conversation to the server-side assistant (Claude). */
export async function askAssistant(input: {
  fields: Field[];
  savedValues: SavedValues;
  contacts: Contact[];
  messages: ChatMessage[];
}): Promise<AssistantResult | null> {
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: input.fields.map((f) => ({ id: f.id, label: f.label, type: f.type, value: f.value, original: f.original })),
      savedValues: input.savedValues,
      contacts: input.contacts.map((c) => ({ name: c.name, kind: c.kind })),
      messages: input.messages,
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Partial<AssistantResult> & { available?: boolean };
  if (!json.available || typeof json.reply !== "string") return null;
  return { reply: json.reply, updates: json.updates ?? [], applyContact: json.applyContact ?? null };
}

/* ------------------------------------------------------------------ */
/* Local assistant: works without any API key.                         */
/* ------------------------------------------------------------------ */

const STRIP = /[«»"'“”]/g;

function findField(fields: Field[], name: string): Field | undefined {
  const key = labelKey(name);
  return (
    fields.find((f) => labelKey(f.label) === key) ??
    fields.find((f) => labelKey(f.label).startsWith(key) || key.startsWith(labelKey(f.label))) ??
    fields.find((f) => labelKey(FIELD_TYPE_LABELS[f.type]) === key)
  );
}

function nextUnfilled(fields: Field[], after?: string): Field | undefined {
  const idx = after ? fields.findIndex((f) => f.id === after) : -1;
  return fields.slice(idx + 1).find((f) => f.value === f.original) ?? fields.find((f) => f.value === f.original && f.id !== after);
}

function suggestions(field: Field, saved: SavedValues): string {
  const vals = saved[labelKey(field.label)] ?? saved[labelKey(FIELD_TYPE_LABELS[field.type])] ?? [];
  return vals.length ? ` Valeurs enregistrées : ${vals.map((v) => `« ${v} »`).join(", ")}.` : "";
}

export function localGreeting(fields: Field[], saved: SavedValues): string {
  if (!fields.length) return "Je n'ai détecté aucun champ sur ce document. Tu peux quand même ajouter des zones manuellement.";
  const first = nextUnfilled(fields);
  const list = fields.map((f) => `« ${f.label} »`).join(", ");
  if (!first) return `J'ai détecté ${fields.length} champ(s) : ${list}. Ils ont tous été modifiés. Dis-moi « Libellé = valeur » pour en changer un.`;
  return `J'ai détecté ${fields.length} champ(s) : ${list}.\nQue veux-tu mettre dans le champ « ${first.label} » ? (valeur actuelle : « ${first.original} »)${suggestions(first, saved)}\nAstuce : « passer » pour ignorer, « Libellé = valeur » pour cibler un champ, « contact Nom » pour appliquer un contact.`;
}

/**
 * Rule-based assistant. Understands:
 *  - a bare value (fills the pending field)
 *  - "passer" / "suivant"
 *  - "Libellé = valeur" / "Libellé : valeur"
 *  - "contact Nom"
 */
export function localAssistant(input: {
  text: string;
  pendingId: string | null;
  fields: Field[];
  savedValues: SavedValues;
  contacts: Contact[];
}): AssistantResult & { pendingId: string | null } {
  const text = input.text.trim();
  const { fields, savedValues, contacts } = input;
  const pending = fields.find((f) => f.id === input.pendingId) ?? nextUnfilled(fields);

  const ask = (f: Field | undefined, prefix = "") => {
    if (!f) {
      const missing = fields.filter((x) => x.value === x.original);
      const tail = missing.length
        ? ` Champs non modifiés : ${missing.map((m) => `« ${m.label} »`).join(", ")}.`
        : " Tous les champs ont été remplis. Tu peux exporter le PDF.";
      return { reply: `${prefix}${tail}`.trim(), pendingId: null };
    }
    return { reply: `${prefix} Que veux-tu mettre dans « ${f.label} » ? (actuellement « ${f.original} »)${suggestions(f, savedValues)}`.trim(), pendingId: f.id };
  };

  if (/^(passer|suivant|skip|next)$/i.test(text)) {
    const n = nextUnfilled(fields, pending?.id);
    return { updates: [], applyContact: null, ...ask(n, "D'accord, on passe.") };
  }

  const contactMatch = /^(?:contact|appliquer|utiliser)\s+(.+)$/i.exec(text);
  const contactName = contactMatch?.[1].replace(STRIP, "").trim();
  const contact = contactName
    ? contacts.find((c) => labelKey(c.name) === labelKey(contactName)) ?? contacts.find((c) => labelKey(c.name).includes(labelKey(contactName)))
    : contacts.find((c) => labelKey(c.name) === labelKey(text));
  if (contact) {
    return { reply: `J'applique le contact « ${contact.name} » aux champs correspondants.`, updates: [], applyContact: contact.name, pendingId: pending?.id ?? null };
  }

  const targeted = /^(.{1,40}?)\s*[=:]\s*(.+)$/.exec(text);
  if (targeted) {
    const f = findField(fields, targeted[1].replace(STRIP, ""));
    if (f) {
      const value = targeted[2].replace(STRIP, "").trim();
      return { updates: [{ id: f.id, value }], applyContact: null, ...ask(nextUnfilled(fields, f.id), `« ${f.label} » ← « ${value} ».`) };
    }
  }

  if (!pending) {
    return { reply: "Tous les champs ont déjà une valeur. Dis-moi « Libellé = valeur » pour en modifier un.", updates: [], applyContact: null, pendingId: null };
  }
  const value = text.replace(STRIP, "").trim();
  const linked = contacts.find((c) => [c.iban, c.email, c.phone, c.name].some((v) => v && labelKey(v) === labelKey(value)));
  const hint = linked ? ` Cette valeur correspond au contact « ${linked.name} » : dis « contact ${linked.name} » pour tout remplir.` : "";
  return {
    updates: [{ id: pending.id, value }],
    applyContact: null,
    ...ask(nextUnfilled(fields, pending.id), `« ${pending.label} » ← « ${value} ».${hint}`),
  };
}

/** Maps a contact onto the document's fields: one name field, the address closest to it, then one field per type. */
export function contactUpdates(contact: Contact, fields: Field[]): { id: string; value: string }[] {
  const updates: { id: string; value: string }[] = [];
  const used = new Set<string>();
  const take = (f: Field | undefined, value?: string) => {
    if (!f || !value || used.has(f.id)) return;
    used.add(f.id);
    updates.push({ id: f.id, value });
  };
  const has = (f: Field, re: RegExp) => re.test(labelKey(f.label));
  const names = fields.filter((f) => f.type === "name");
  const nameField =
    names.find((f) => has(f, /beneficiaire|client|destinataire|titulaire|^nom|^name|societe|entreprise|fournisseur|^to\b|bill to/)) ?? names[0];
  take(nameField, contact.name);

  const addresses = fields.filter((f) => f.type === "address");
  const dist = (f: Field) => (nameField && f.page === nameField.page ? Math.hypot(f.x - nameField.x, f.y - nameField.y) : Infinity);
  const addressField = [...addresses].sort((a, b) => dist(a) - dist(b))[0];
  take(addressField, contact.address);

  take(fields.find((f) => f.type === "iban"), contact.iban);
  take(fields.find((f) => f.type === "bic" || has(f, /banque|bank|etablissement/)), contact.bank);
  take(fields.find((f) => f.type === "email"), contact.email);
  take(fields.find((f) => f.type === "phone"), contact.phone);
  take(fields.find((f) => f.type === "siren"), contact.siren);
  return updates;
}
