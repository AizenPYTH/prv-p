"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Contact, DocModel, Field, SavedDoc, SavedValues, Template } from "@/lib/types";
import { labelKey, uid } from "@/lib/types";
import { loadImage, loadPdf, RENDER_SCALE, sampleBackground, type RenderedPage } from "@/lib/pdf";
import { ocrCanvas } from "@/lib/ocr";
import { aiAvailable, classifySegments, contactUpdates } from "@/lib/ai";
import { exportPdf, downloadBytes } from "@/lib/exportPdf";
import { storage } from "@/lib/storage";
import { APP_VERSION } from "@/lib/version";
import DocumentView from "./DocumentView";
import FieldPanel from "./FieldPanel";
import AssistantPanel from "./AssistantPanel";
import ContactsPanel from "./ContactsPanel";
import TemplatesPanel from "./TemplatesPanel";
import DocumentsPanel, { formatDate } from "./DocumentsPanel";

type Tab = "field" | "assistant" | "contacts" | "templates" | "documents";

const readFile = (file: File) =>
  Promise.all([
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    }),
    file.arrayBuffer(),
  ]);

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const bin = atob(dataUrl.split(",")[1] ?? "");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export default function Editor() {
  const [doc, setDoc] = useState<DocModel | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("field");
  const [addMode, setAddMode] = useState(false);
  const [showAll, setShowAll] = useState(true);
  const [aiOn, setAiOn] = useState(false);
  const [source, setSource] = useState<"ai" | "heuristic" | "template" | null>(null);
  const [savedValues, setSavedValues] = useState<SavedValues>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [documents, setDocuments] = useState<SavedDoc[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // localStorage is only readable after hydration, so the library is loaded here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedValues(storage.loadValues());
    setContacts(storage.loadContacts());
    void storage.loadTemplates().then(setTemplates);
    void storage.loadDocuments().then(setDocuments);
    void aiAvailable().then(setAiOn);
  }, []);

  // Auto-save the open document (debounced) so it can be reopened later.
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => {
      const saved: SavedDoc = {
        id: doc.id,
        name: doc.name,
        updatedAt: Date.now(),
        kind: doc.kind,
        mime: doc.mime,
        dataUrl: doc.dataUrl,
        fields: doc.fields,
        pages: doc.pages.map(({ width, height }) => ({ width, height })),
      };
      storage
        .putDocument(saved)
        .then(() => setDocuments((list) => [saved, ...list.filter((d) => d.id !== saved.id)]))
        .catch(() => setError("Sauvegarde automatique impossible (stockage du navigateur plein ?)."));
    }, 800);
    return () => clearTimeout(t);
  }, [doc]);

  const selected = doc?.fields.find((f) => f.id === selectedId) ?? null;
  /** Generic text zones can be hidden; classified and edited zones always show. */
  const visibleFields = doc ? doc.fields.filter((f) => showAll || !f.generic || f.value !== f.original) : [];
  const classifiedCount = doc ? doc.fields.filter((f) => !f.generic).length : 0;

  /* ---------- import ---------- */

  const renderPages = useCallback(async (kind: "pdf" | "image", dataUrl: string, buffer: ArrayBuffer): Promise<RenderedPage[]> => {
    if (kind === "pdf") {
      setStatus("Lecture du PDF…");
      const pages = await loadPdf(buffer);
      for (const p of pages) {
        if (p.segments.length) continue;
        setStatus(`OCR page ${p.index + 1}/${pages.length}… (document scanné)`);
        p.segments = await ocrCanvas(p.canvas, p.index, RENDER_SCALE, (pr) => setStatus(`OCR page ${p.index + 1}/${pages.length}… ${Math.round(pr * 100)}%`));
      }
      return pages;
    }
    setStatus("Lecture de l'image…");
    const page = await loadImage(dataUrl);
    setStatus("OCR en cours… (téléchargement du moteur au premier usage)");
    page.segments = await ocrCanvas(page.canvas, 0, 1, (pr) => setStatus(`OCR en cours… ${Math.round(pr * 100)}%`));
    return [page];
  }, []);

  const withBackgrounds = (fields: Field[], pages: RenderedPage[], kind: "pdf" | "image") =>
    fields.map((f) => {
      const page = pages[f.page];
      return page ? { ...f, bg: sampleBackground(page.canvas, f, kind === "pdf" ? RENDER_SCALE : 1) } : f;
    });

  const importFile = async (file: File) => {
    setError(null);
    try {
      const kind = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? "pdf" : "image";
      if (kind === "image" && !/^image\/(png|jpe?g)$/.test(file.type)) throw new Error("Format non supporté : PDF, JPG ou PNG uniquement.");
      const [dataUrl, buffer] = await readFile(file);
      const pages = await renderPages(kind, dataUrl, buffer);
      setStatus(aiOn ? "Classification des champs par l'IA…" : "Détection des champs…");
      const segments = pages.flatMap((p) => p.segments);
      const { fields, source: src } = await classifySegments(segments);
      setSource(src);
      setDoc({
        id: uid("doc"),
        name: file.name,
        kind,
        mime: kind === "pdf" ? "application/pdf" : file.type,
        dataUrl,
        pages: pages.map(({ index, width, height, imageUrl }) => ({ index, width, height, imageUrl })),
        fields: withBackgrounds(fields, pages, kind),
      });
      setSelectedId(null);
      setTab("field");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  };

  const openTemplate = async (t: Template) => {
    setError(null);
    try {
      setStatus("Ouverture du modèle…");
      const pages = t.kind === "pdf" ? await loadPdf(dataUrlToBuffer(t.dataUrl)) : [await loadImage(t.dataUrl)];
      setSource("template");
      setDoc({
        id: uid("doc"),
        name: t.name,
        kind: t.kind,
        mime: t.mime,
        dataUrl: t.dataUrl,
        pages: pages.map(({ index, width, height, imageUrl }) => ({ index, width, height, imageUrl })),
        fields: withBackgrounds(
          t.fields.map((f) => ({ ...f, value: f.original })),
          pages,
          t.kind,
        ),
      });
      setSelectedId(null);
      setTab("field");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  };

  const openSaved = async (d: SavedDoc) => {
    setError(null);
    try {
      setStatus("Ouverture du document…");
      const pages = d.kind === "pdf" ? await loadPdf(dataUrlToBuffer(d.dataUrl)) : [await loadImage(d.dataUrl)];
      setSource("template");
      setDoc({
        id: d.id,
        name: d.name,
        kind: d.kind,
        mime: d.mime,
        dataUrl: d.dataUrl,
        pages: pages.map(({ index, width, height, imageUrl }) => ({ index, width, height, imageUrl })),
        fields: d.fields,
      });
      setSelectedId(null);
      setTab("field");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
    }
  };

  const deleteDocument = async (id: string) => {
    await storage.deleteDocument(id).catch(() => undefined);
    setDocuments((list) => list.filter((d) => d.id !== id));
  };

  /* ---------- fields ---------- */

  const patchField = (id: string, patch: Partial<Field>) =>
    setDoc(
      (d) =>
        d && {
          ...d,
          // Renaming or retyping a generic zone turns it into a real field.
          fields: d.fields.map((f) => (f.id === id ? { ...f, ...patch, ...("label" in patch || "type" in patch ? { generic: false } : {}) } : f)),
        },
    );

  const applyUpdates = (updates: { id: string; value: string }[]) =>
    setDoc((d) => d && { ...d, fields: d.fields.map((f) => ({ ...f, value: updates.find((u) => u.id === f.id)?.value ?? f.value })) });

  const deleteField = (id: string) => {
    setDoc((d) => d && { ...d, fields: d.fields.filter((f) => f.id !== id) });
    setSelectedId(null);
  };

  const addFieldAt = (page: number, x: number, y: number) => {
    if (!doc) return;
    // Use the font size of the closest existing zone on this page so the new text matches the document.
    const near = doc.fields
      .filter((f) => f.page === page)
      .sort((p, q) => Math.hypot(p.x - x, p.y - y) - Math.hypot(q.x - x, q.y - y))[0];
    const fontSize = near?.fontSize ?? (doc.kind === "pdf" ? 11 : Math.max(14, doc.pages[page].width / 60));
    const field: Field = {
      id: uid("f"),
      page,
      label: `Zone ${doc.fields.length + 1}`,
      type: "text",
      original: "",
      value: "",
      x,
      y: y - fontSize * 0.6,
      w: fontSize * 12,
      h: fontSize * 1.2,
      fontSize,
      bg: "#ffffff",
      font: near?.font,
      ox: x,
      oy: y - fontSize * 0.6,
    };
    setDoc({ ...doc, fields: [...doc.fields, field] });
    setSelectedId(field.id);
    setTab("field");
    setAddMode(false);
  };

  const applyContact = (c: Contact) => {
    if (!doc) return;
    const updates = contactUpdates(c, doc.fields);
    if (!updates.length) {
      setError("Aucun champ correspondant à ce contact sur le document.");
      return;
    }
    applyUpdates(updates);
    setTab("field");
  };

  /* ---------- library ---------- */

  const saveValue = (label: string, value: string) => {
    const key = labelKey(label);
    const next = { ...savedValues, [key]: Array.from(new Set([value, ...(savedValues[key] ?? [])])).slice(0, 20) };
    setSavedValues(next);
    storage.saveValues(next);
  };
  const deleteValue = (label: string, value: string) => {
    const key = labelKey(label);
    const next = { ...savedValues, [key]: (savedValues[key] ?? []).filter((v) => v !== value) };
    setSavedValues(next);
    storage.saveValues(next);
  };
  const updateContacts = (c: Contact[]) => {
    setContacts(c);
    storage.saveContacts(c);
  };
  const deleteTemplate = async (id: string) => {
    await storage.deleteTemplate(id).catch(() => undefined);
    setTemplates((list) => list.filter((t) => t.id !== id));
  };

  const saveTemplate = async () => {
    if (!doc) return;
    const name = window.prompt("Nom du modèle :", doc.name.replace(/\.[^.]+$/, ""));
    if (!name) return;
    const t: Template = {
      id: uid("tpl"),
      name,
      createdAt: Date.now(),
      kind: doc.kind,
      mime: doc.mime,
      dataUrl: doc.dataUrl,
      fields: doc.fields,
      pages: doc.pages.map(({ width, height }) => ({ width, height })),
    };
    try {
      await storage.putTemplate(t);
      setTemplates((list) => [t, ...list]);
      setTab("templates");
    } catch {
      setError("Impossible d'enregistrer le modèle (stockage du navigateur plein ?).");
    }
  };

  const doExport = async () => {
    if (!doc) return;
    try {
      setStatus("Génération du PDF…");
      const bytes = await exportPdf(doc);
      downloadBytes(bytes, doc.name.replace(/\.[^.]+$/, "") + "-modifie.pdf");
    } catch (e) {
      setError("Export impossible : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setStatus(null);
    }
  };

  /* ---------- UI ---------- */

  const Import = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
      <button className="btn-primary" onClick={() => fileInput.current?.click()} disabled={!!status}>
        Importer un document
      </button>
    </>
  );

  if (!doc) {
    return (
      <main
        className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gray-50 p-6"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void importFile(f);
        }}
      >
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Smart Document Editor</h1>
          <p className="mt-2 text-gray-500">Importer → Détecter → Modifier → Enregistrer → Exporter</p>
        </div>
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10">
          {Import}
          <p className="text-xs text-gray-500">PDF, JPG ou PNG — ou glisse le fichier ici</p>
          {status && <p className="text-sm text-blue-600">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        {documents.length > 0 && (
          <div className="w-full max-w-md">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Mes documents</h2>
            <ul className="space-y-1">
              {documents.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center gap-1">
                  <button onClick={() => void openSaved(d)} className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400">
                    {d.name} <span className="text-gray-400">· {formatDate(d.updatedAt)} · {d.fields.filter((f) => f.value !== f.original).length} modif.</span>
                  </button>
                  <button title="Supprimer" onClick={() => void deleteDocument(d.id)} className="px-2 text-gray-400 hover:text-red-600">×</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {templates.length > 0 && (
          <div className="w-full max-w-md">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Mes modèles</h2>
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button onClick={() => void openTemplate(t)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-400">
                    {t.name} <span className="text-gray-400">· {t.fields.length} champ(s)</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-gray-400">
          v{APP_VERSION} · IA : {aiOn ? "Claude (clé configurée)" : "mode local (ajoute ANTHROPIC_API_KEY pour activer Claude)"} · N&apos;utilise cet outil que sur des documents que tu es autorisé à modifier.
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-gray-100">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <button className="font-semibold hover:text-blue-700" title="Retour à l'accueil" onClick={() => setDoc(null)}>
          Smart Document Editor <span className="text-[10px] font-normal text-gray-400">v{APP_VERSION}</span>
        </button>
        <span className="truncate text-sm text-gray-500">{doc.name}</span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
          {classifiedCount} champs reconnus · {doc.fields.length} zones · {source === "ai" ? "Claude" : source === "template" ? "modèle" : "détection locale"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {status && <span className="text-sm text-blue-600">{status}</span>}
          <label className="flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Tout le texte modifiable
          </label>
          <button className={`btn ${addMode ? "!border-blue-500 !bg-blue-50" : ""}`} onClick={() => setAddMode((v) => !v)}>
            {addMode ? "Clique sur le document…" : "Ajouter une zone"}
          </button>
          {Import}
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between bg-red-50 px-4 py-1 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-auto">
          <DocumentView
            doc={{ ...doc, fields: visibleFields }}
            selectedId={selectedId}
            addMode={addMode}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setTab("field");
            }}
            onChange={(id, value) => patchField(id, { value })}
            onMove={(id, x, y) => patchField(id, { x, y })}
            onAddAt={addFieldAt}
          />
        </section>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-gray-200 bg-white p-4">
          {tab === "field" && (
            <FieldPanel
              fields={visibleFields}
              selected={selected}
              savedValues={savedValues}
              onSelect={setSelectedId}
              onChange={patchField}
              onDelete={deleteField}
              onSaveValue={saveValue}
              onDeleteValue={deleteValue}
            />
          )}
          {tab === "assistant" && (
            <AssistantPanel
              docId={doc.id}
              fields={doc.fields.filter((f) => !f.generic || f.value !== f.original)}
              savedValues={savedValues}
              contacts={contacts}
              aiOn={aiOn}
              onUpdates={applyUpdates}
              onApplyContact={(name) => {
                const c = contacts.find((x) => labelKey(x.name) === labelKey(name));
                if (c) applyContact(c);
              }}
            />
          )}
          {tab === "contacts" && <ContactsPanel contacts={contacts} onChange={updateContacts} onApply={applyContact} canApply={!!doc} />}
          {tab === "templates" && (
            <TemplatesPanel
              templates={templates}
              onOpen={(t) => void openTemplate(t)}
              onDelete={(id) => void deleteTemplate(id)}
              onSaveCurrent={() => void saveTemplate()}
              canSave={!!doc}
            />
          )}
          {tab === "documents" && <DocumentsPanel documents={documents} currentId={doc.id} onOpen={(d) => void openSaved(d)} onDelete={(id) => void deleteDocument(id)} />}
        </aside>
      </div>

      <footer className="flex items-center gap-2 border-t border-gray-200 bg-white px-4 py-2">
        <TabButton active={tab === "field"} onClick={() => setTab("field")}>Champs</TabButton>
        <TabButton active={tab === "assistant"} onClick={() => setTab("assistant")}>Assistant IA</TabButton>
        <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")}>Contacts</TabButton>
        <TabButton active={tab === "templates"} onClick={() => setTab("templates")}>Modèles</TabButton>
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>Mes documents</TabButton>
        <div className="ml-auto flex gap-2">
          <button className="btn" onClick={() => void saveTemplate()}>Enregistrer modèle</button>
          <button className="btn-primary" onClick={() => void doExport()} disabled={!!status}>Exporter PDF</button>
        </div>
      </footer>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`btn ${active ? "!border-blue-500 !bg-blue-50 !text-blue-700" : ""}`}>
      {children}
    </button>
  );
}
