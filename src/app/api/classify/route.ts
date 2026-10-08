import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { askJson, getClient } from "@/lib/claude";

const TYPES = ["date", "amount", "name", "address", "iban", "bic", "reference", "invoice_number", "phone", "email", "siren", "percent", "text"];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "type", "value"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          type: { type: "string", enum: TYPES },
          value: { type: "string", description: "Exact substring of the segment text that is the editable value" },
        },
      },
    },
  },
};

const SYSTEM = `You classify text segments extracted from an administrative document (invoice, receipt, order, letter, statement...).
Return every segment, or part of a segment, that a user would plausibly want to edit: dates, amounts, names, addresses, IBAN/BIC, references, invoice numbers, phones, emails, company identifiers.
Rules:
- "value" must be an exact substring of that segment's text (the editable part only, never the label).
- "label" is a short French field name taken from the document when a label exists (e.g. "Bénéficiaire", "Date d'échéance", "Total TTC"), otherwise a generic one.
- Skip pure labels, headings, legal boilerplate and column headers.
- Labels must be unique: suffix duplicates with 2, 3...`;

export async function POST(req: Request) {
  if (!getClient()) return NextResponse.json({ available: false, fields: [] });
  const { segments } = (await req.json()) as { segments: { id: string; text: string; page: number }[] };
  if (!Array.isArray(segments) || !segments.length) return NextResponse.json({ available: true, fields: [] });

  const listing = segments.map((s) => `[${s.id}] (page ${s.page + 1}) ${s.text}`).join("\n");
  try {
    const out = await askJson<{ fields: { id: string; label: string; type: string; value: string }[] }>({
      system: SYSTEM,
      messages: [{ role: "user", content: `Segments:\n${listing}` }],
      schema: SCHEMA,
      maxTokens: 8000,
    });
    return NextResponse.json({ available: true, fields: out?.fields ?? [] });
  } catch (err) {
    const message = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : String(err);
    return NextResponse.json({ available: true, fields: [], error: message }, { status: 502 });
  }
}
