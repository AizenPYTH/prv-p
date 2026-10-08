import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
export function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

/**
 * One structured-output call. Returns the parsed JSON or null on refusal /
 * unparsable output. Server-side fallbacks are enabled so a safety decline is
 * retried on the model Anthropic recommends.
 */
export async function askJson<T>(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T | null> {
  const c = getClient();
  if (!c) return null;
  const res = await c.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: opts.messages,
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
