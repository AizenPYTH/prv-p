"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Contact, Field, SavedValues } from "@/lib/types";
import { askAssistant, localAssistant, localGreeting } from "@/lib/ai";

interface Props {
  docId: string;
  fields: Field[];
  savedValues: SavedValues;
  contacts: Contact[];
  aiOn: boolean;
  onUpdates: (updates: { id: string; value: string }[]) => void;
  onApplyContact: (name: string) => void;
}

export default function AssistantPanel({ docId, fields, savedValues, contacts, aiOn, onUpdates, onApplyContact }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const greetedFor = useRef<string | null>(null);

  // Greet once per document.
  useEffect(() => {
    if (greetedFor.current === docId) return;
    greetedFor.current = docId;
    setMessages([]);
    setPendingId(null);
    const greet = async () => {
      if (aiOn) {
        setBusy(true);
        const res = await askAssistant({ fields, savedValues, contacts, messages: [] }).catch(() => null);
        setBusy(false);
        if (res) {
          setMessages([{ role: "assistant", content: res.reply }]);
          return;
        }
      }
      setMessages([{ role: "assistant", content: localGreeting(fields, savedValues) }]);
    };
    void greet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, aiOn]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setBusy(true);
    try {
      let result: { reply: string; updates: { id: string; value: string }[]; applyContact: string | null } | null = null;
      if (aiOn) result = await askAssistant({ fields, savedValues, contacts, messages: next }).catch(() => null);
      if (!result) {
        const local = localAssistant({ text, pendingId, fields, savedValues, contacts });
        setPendingId(local.pendingId);
        result = local;
      }
      if (result.updates.length) onUpdates(result.updates);
      if (result.applyContact) onApplyContact(result.applyContact);
      setMessages([...next, { role: "assistant", content: result.reply }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="panel-title !mb-0">Assistant IA</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${aiOn ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
          {aiOn ? "Claude" : "mode local"}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
              m.role === "user" ? "ml-6 bg-blue-600 text-white" : "mr-6 bg-white text-gray-800 shadow-sm"
            }`}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="mr-6 rounded-lg bg-white px-3 py-2 text-sm text-gray-400 shadow-sm">…</div>}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="mt-2 flex gap-2"
      >
        <input className="input flex-1" placeholder="Ta réponse… (ex. Facture 2026-104)" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={busy || !input.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
