import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { askJson, getClient } from "@/lib/claude";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "updates", "applyContact"],
  properties: {
    reply: { type: "string", description: "Short French reply to show the user" },
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "value"],
        properties: { id: { type: "string" }, value: { type: "string" } },
      },
    },
    applyContact: { type: ["string", "null"], description: "Name of a saved contact to apply to the document, or null" },
  },
};

const SYSTEM = `Tu es l'assistant d'un éditeur de documents administratifs. L'utilisateur a importé un document dont des champs ont été détectés.
Ton rôle : l'aider à remplir les champs, en français, de façon concise.
- Quand l'utilisateur donne une valeur, mets-la dans "updates" avec l'id du champ concerné, puis propose le champ suivant non rempli.
- Propose les valeurs enregistrées pertinentes quand elles existent.
- Signale les champs probablement liés (ex. un IBAN et un nom de bénéficiaire d'un même contact) et les informations manquantes.
- Si l'utilisateur veut appliquer un contact, renvoie son nom exact dans "applyContact".
- Ne modifie jamais un champ sans que l'utilisateur l'ait demandé ou confirmé.
- Réponses courtes (2 à 4 phrases maximum).`;

interface Body {
  fields: { id: string; label: string; type: string; value: string; original: string }[];
  savedValues: Record<string, string[]>;
  contacts: { name: string; kind: string }[];
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: Request) {
  if (!getClient()) return NextResponse.json({ available: false });
  const body = (await req.json()) as Body;
  const context = [
    "Champs détectés (id | libellé | type | valeur actuelle | valeur d'origine):",
    ...body.fields.map((f) => `${f.id} | ${f.label} | ${f.type} | ${f.value} | ${f.original}`),
    "",
    "Valeurs enregistrées par libellé:",
    ...Object.entries(body.savedValues).map(([k, v]) => `${k}: ${v.join(" ; ")}`),
    "",
    "Contacts enregistrés: " + (body.contacts.map((c) => `${c.name} (${c.kind})`).join(", ") || "aucun"),
  ].join("\n");

  const history: Anthropic.Beta.BetaMessageParam[] = body.messages.length
    ? body.messages.map((m) => ({ role: m.role, content: m.content }))
    : [{ role: "user", content: "Bonjour, commence par me présenter les champs détectés et me demander le premier." }];
  if (history[0].role !== "user") history.unshift({ role: "user", content: "Commençons." });

  try {
    const out = await askJson<{ reply: string; updates: { id: string; value: string }[]; applyContact: string | null }>({
      system: `${SYSTEM}\n\n${context}`,
      messages: history,
      schema: SCHEMA,
    });
    if (!out) return NextResponse.json({ available: true, reply: "Je n'ai pas pu répondre à cette demande.", updates: [], applyContact: null });
    return NextResponse.json({ available: true, ...out });
  } catch (err) {
    const message = err instanceof Anthropic.APIError ? `API ${err.status}: ${err.message}` : String(err);
    return NextResponse.json({ available: true, error: message }, { status: 502 });
  }
}
