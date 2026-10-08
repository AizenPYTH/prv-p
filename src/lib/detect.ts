import type { Field, FieldType, TextSegment } from "./types";
import { FIELD_TYPE_LABELS, uid } from "./types";
import { textRange } from "./text";

/** Label keywords → field type. Generic across invoices, receipts, orders, letters... */
const LABEL_RULES: { re: RegExp; type: FieldType }[] = [
  { re: /\b(iban)\b/i, type: "iban" },
  { re: /\b(bic|swift)\b/i, type: "bic" },
  { re: /\b(e-?mail|courriel|mail)\b/i, type: "email" },
  { re: /\b(t[ée]l[ée]phone|t[ée]l\.?|phone|mobile|portable|fax)\b/i, type: "phone" },
  { re: /\b(siren|siret|rcs|tva intracom|n°\s*tva|vat)\b/i, type: "siren" },
  { re: /\b(adresse|address|si[èe]ge|domicile|lieu)\b/i, type: "address" },
  { re: /\b(date|le|[ée]mis(e)? le|[ée]ch[ée]ance|due|valable|p[ée]riode|du|au|issued|payment date)\b/i, type: "date" },
  { re: /\b(montant|total|sous-total|ttc|ht|tva|prix|amount|net|brut|solde|somme|acompte|remise|frais|co[uû]t|salaire|loyer|balance|price|subtotal|tax|paid|payé|dû|due amount)\b/i, type: "amount" },
  { re: /\b(facture|invoice|n°\s*facture|num[ée]ro de facture|avoir|credit note)\b/i, type: "invoice_number" },
  { re: /\b(r[ée]f[ée]rence|r[ée]f\.?|ref|num[ée]ro|n°|no\.?|commande|order|dossier|contrat|client n|libell[ée]|motif|objet|devis|quote|transaction|op[ée]ration|id)\b/i, type: "reference" },
  { re: /\b(nom|name|b[ée]n[ée]ficiaire|client|destinataire|[ée]metteur|exp[ée]diteur|fournisseur|vendeur|acheteur|titulaire|soci[ée]t[ée]|entreprise|raison sociale|contact|from|to|bill to|ship to|payer|payé [àa]|attention|signataire|responsable)\b/i, type: "name" },
];

interface ValueRule {
  type: FieldType;
  re: RegExp;
  check?: (m: string) => boolean;
}

const MONTHS =
  "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|janv|f[ée]vr|avr|juil|sept|oct|nov|d[ée]c|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|dec";

/** Value patterns in priority order. Each regex must have the global flag for matchAll. */
const VALUE_RULES: ValueRule[] = [
  { type: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  {
    type: "iban",
    re: /\b[A-Z]{2}\d{2}(?:[  ]?[A-Z0-9]{4}){2,7}(?:[  ]?[A-Z0-9]{1,4})?\b/g,
    check: (m) => m.replace(/\s/g, "").length >= 15,
  },
  {
    type: "date",
    re: new RegExp(
      `\\b(?:\\d{1,2}[\\/.\\-]\\d{1,2}[\\/.\\-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\.?\\s+\\d{4}|(?:${MONTHS})\\.?\\s+\\d{1,2},?\\s+\\d{4})\\b`,
      "gi",
    ),
  },
  {
    type: "amount",
    re: /(?:(?:€|\$|£|EUR|USD|GBP|CHF)\s?)?-?\d{1,3}(?:[  .,]?\d{3})*(?:[.,]\d{1,2})?\s?(?:€|\$|£|EUR|USD|GBP|CHF)/g,
  },
  {
    type: "amount",
    re: /(?:€|\$|£)\s?-?\d{1,3}(?:[  .,]?\d{3})*(?:[.,]\d{1,2})?/g,
  },
  { type: "percent", re: /\b\d{1,3}(?:[.,]\d{1,2})?\s?%/g },
  {
    type: "phone",
    re: /(?:\+\d{1,3}[  .-]?)?(?:\(?0\)?[  .-]?)?\d{1,4}(?:[  .-]?\d{2,4}){2,4}\b/g,
    check: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 9 && digits.length <= 15 && /^[+0(]/.test(m.trim());
    },
  },
  {
    type: "siren",
    re: /\b\d{3}[  ]?\d{3}[  ]?\d{3}(?:[  ]?\d{5})?\b/g,
    check: (m) => [9, 14].includes(m.replace(/\D/g, "").length),
  },
  {
    type: "address",
    re: /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.?|boulevard|bd|chemin|all[ée]e|place|impasse|route|quai|cours|square|street|st\.?|road|rd\.?|lane|drive)\b[^,;]*/gi,
  },
  { type: "address", re: /\b\d{5}\s+[A-ZÀ-Ü][A-Za-zÀ-ÿ'’ -]{2,}/g },
  {
    type: "reference",
    re: /\b(?:[A-Z]{1,5}[-_/ ]?)?\d{2,}(?:[-_/.]\d+)*(?:[-_/][A-Z0-9]+)*\b/g,
    check: (m) => /\d{3,}/.test(m) && m.length >= 4,
  },
];

const LABEL_SPLIT = /^(.{1,40}?)\s*[:：]\s*(.+)$/;

function cleanLabel(raw: string): string {
  return raw.replace(/[:：\s]+$/g, "").replace(/^[\s•\-–]+/, "").trim();
}

/** Accents break `\b` in JS regexes ("Émetteur"), so rules are tested on a de-accented copy too. */
const deaccent = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function typeFromLabel(label: string): FieldType | null {
  const plain = deaccent(label);
  for (const rule of LABEL_RULES) if (rule.re.test(label) || rule.re.test(plain)) return rule.type;
  return null;
}

function looksLikeLabel(text: string): boolean {
  if (/[:：]\s*$/.test(text)) return true;
  if (text.length > 40) return false;
  if (/\d{3,}/.test(text)) return false;
  return typeFromLabel(text) !== null && text.split(/\s+/).length <= 5;
}

interface Candidate {
  seg: TextSegment;
  start: number;
  end: number;
  type: FieldType;
  label: string;
  priority: number;
}

/**
 * Heuristic field detection. Works in three passes:
 *  1. "Label : value" within a single segment
 *  2. A label segment followed by a value segment (same line, or just below)
 *  3. Free-standing values matched by pattern (dates, amounts, IBAN, ...)
 */
export function detectFields(segments: TextSegment[]): Field[] {
  const candidates: Candidate[] = [];
  const consumed = new Set<string>();
  const byPage = new Map<number, TextSegment[]>();
  for (const s of segments) byPage.set(s.page, [...(byPage.get(s.page) ?? []), s]);

  // Pass 1: inline "Label : value"
  for (const seg of segments) {
    const m = seg.text.match(LABEL_SPLIT);
    if (!m) continue;
    const label = cleanLabel(m[1]);
    const value = m[2].trim();
    if (!label || !value || value.length > 80) continue;
    const start = seg.text.length - m[2].length + (m[2].length - m[2].trimStart().length);
    const type = typeFromLabel(label) ?? guessType(value) ?? "text";
    candidates.push({ seg, start, end: seg.text.length, type, label, priority: 3 });
    consumed.add(seg.id);
  }

  // Pass 2: label segment → neighbour value segment
  for (const [, segs] of byPage) {
    for (const seg of segs) {
      if (consumed.has(seg.id) || !looksLikeLabel(seg.text)) continue;
      const label = cleanLabel(seg.text);
      if (!label) continue;
      const right = segs
        .filter(
          (o) =>
            o.id !== seg.id &&
            !consumed.has(o.id) &&
            Math.abs(o.y + o.h / 2 - (seg.y + seg.h / 2)) < seg.h * 0.9 &&
            o.x >= seg.x + seg.w - seg.h * 0.2 &&
            o.x - (seg.x + seg.w) < seg.h * 40,
        )
        .sort((a, b) => a.x - b.x)[0];
      const below = right
        ? undefined
        : segs
            .filter(
              (o) =>
                o.id !== seg.id &&
                !consumed.has(o.id) &&
                o.y > seg.y + seg.h * 0.5 &&
                o.y - (seg.y + seg.h) < seg.h * 1.2 &&
                Math.abs(o.x - seg.x) < seg.h * 3 &&
                !looksLikeLabel(o.text),
            )
            .sort((a, b) => a.y - b.y)[0];
      const value = right ?? below;
      if (!value || value.text.length > 100) continue;
      const type = typeFromLabel(label) ?? guessType(value.text) ?? "text";
      candidates.push({ seg: value, start: 0, end: value.text.length, type, label, priority: 2 });
      consumed.add(seg.id);
      consumed.add(value.id);
    }
  }

  // Pass 3: pattern-matched values
  for (const seg of segments) {
    if (consumed.has(seg.id)) continue;
    const taken: [number, number][] = [];
    for (const rule of VALUE_RULES) {
      for (const m of seg.text.matchAll(rule.re)) {
        const text = m[0];
        const start = m.index ?? 0;
        const end = start + text.length;
        if (!text.trim() || (rule.check && !rule.check(text))) continue;
        if (taken.some(([s, e]) => start < e && end > s)) continue;
        taken.push([start, end]);
        candidates.push({
          seg,
          start,
          end,
          type: rule.type,
          label: inferLabel(seg, segments, rule.type),
          priority: 1,
        });
      }
    }
  }

  const fields: Field[] = candidates.map((c) => {
      const { x, w } = textRange(c.seg, c.start, c.end);
      const original = c.seg.text.slice(c.start, c.end).trim();
      return {
        id: uid("f"),
        page: c.seg.page,
        label: c.label,
        type: c.type,
        original,
        value: original,
        x,
        y: c.seg.y,
        w: Math.max(w, c.seg.fontSize),
        h: c.seg.h,
        fontSize: c.seg.fontSize,
        bold: c.seg.bold,
        bg: "#ffffff",
        segmentId: c.seg.id,
      };
    });

  return finalizeFields(fields, segments);
}

/**
 * Makes every remaining text segment an editable "Texte" zone, so nothing on
 * the document is left uneditable, then sorts in reading order and makes
 * labels unique.
 */
export function finalizeFields(classified: Field[], segments: TextSegment[]): Field[] {
  const used = new Set(classified.map((f) => f.segmentId));
  const leftovers: Field[] = segments
    .filter((s) => !used.has(s.id))
    .map((s) => ({
      id: uid("f"),
      page: s.page,
      label: "Texte",
      type: "text" as const,
      original: s.text,
      value: s.text,
      x: s.x,
      y: s.y,
      w: Math.max(s.w, s.fontSize),
      h: s.h,
      fontSize: s.fontSize,
      bold: s.bold,
      bg: "#ffffff",
      segmentId: s.id,
      generic: true,
    }));
  const all = [...classified, ...leftovers].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  return dedupeLabels(all);
}

/** Guess a type from the value text alone. */
export function guessType(value: string): FieldType | null {
  for (const rule of VALUE_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.replace("g", ""));
    const m = value.match(re);
    if (m && m[0].length >= value.trim().length * 0.6 && (!rule.check || rule.check(m[0]))) return rule.type;
  }
  if (/^[A-ZÀ-Ü][A-Za-zÀ-ÿ'’ .-]{2,40}$/.test(value.trim()) && value.trim().split(/\s+/).length <= 5) return "name";
  return null;
}

/** For a bare value, look for a label-ish segment to its left or above it. */
function inferLabel(seg: TextSegment, all: TextSegment[], type: FieldType): string {
  const sameLine = all
    .filter(
      (o) =>
        o.page === seg.page &&
        o.id !== seg.id &&
        Math.abs(o.y + o.h / 2 - (seg.y + seg.h / 2)) < seg.h * 0.6 &&
        o.x + o.w <= seg.x + seg.h * 0.5 &&
        looksLikeLabel(o.text),
    )
    .sort((a, b) => b.x - a.x)[0];
  if (sameLine) return cleanLabel(sameLine.text);
  const above = all
    .filter(
      (o) =>
        o.page === seg.page &&
        o.id !== seg.id &&
        o.y < seg.y &&
        seg.y - (o.y + o.h) < seg.h * 1.2 &&
        Math.abs(o.x - seg.x) < seg.h * 2 &&
        looksLikeLabel(o.text),
    )
    .sort((a, b) => b.y - a.y)[0];
  if (above) return cleanLabel(above.text);
  return FIELD_TYPE_LABELS[type];
}

/** Makes labels unique ("Date", "Date 2", ...) so saved values and the assistant can address them. */
function dedupeLabels(fields: Field[]): Field[] {
  const seen = new Map<string, number>();
  return fields.map((f) => {
    const base = f.label || FIELD_TYPE_LABELS[f.type];
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...f, label: n === 1 ? base : `${base} ${n}` };
  });
}
