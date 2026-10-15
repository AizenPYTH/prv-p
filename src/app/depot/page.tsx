"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * Préparation d'un dépôt de capital : saisie de la société et des souscripteurs,
 * contrôles automatiques, liste imprimable. C'est l'équivalent web du classeur
 * Excel « Depot_capital_saisie ». Ce n'est pas un certificat : il ne contient
 * ni banque, ni signataire, ni texte d'attestation.
 */

type Forme = "SAS" | "SASU" | "SA" | "SARL" | "EURL" | "SCI" | "Autre";
const FORMES: Forme[] = ["SAS", "SASU", "SA", "SARL", "EURL", "SCI", "Autre"];
/** Fraction minimale du capital à libérer à la constitution. */
const MINIMUM: Record<Forme, number | null> = { SAS: 0.5, SASU: 0.5, SA: 0.5, SARL: 0.2, EURL: 0.2, SCI: null, Autre: null };

interface Souscripteur {
  id: number;
  nom: string;
  domicile: string;
  souscrit: string;
  verse: string;
}
interface Dossier {
  denomination: string;
  forme: Forme;
  capital: string;
  siege: string;
  date: string;
  souscripteurs: Souscripteur[];
}

const KEY = "depot:dossier";
const vide = (id: number): Souscripteur => ({ id, nom: "", domicile: "", souscrit: "", verse: "" });
const initial = (): Dossier => ({ denomination: "", forme: "SAS", capital: "", siege: "", date: "", souscripteurs: [vide(1), vide(2)] });

const num = (s: string) => {
  const n = parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("fr-FR") : "");

export default function DepotPage() {
  const [d, setD] = useState<Dossier>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setD(JSON.parse(raw) as Dossier);
    } catch {
      /* brouillon illisible : on repart de zéro */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* stockage indisponible */
    }
  }, [d, loaded]);

  const set = (patch: Partial<Dossier>) => setD((x) => ({ ...x, ...patch }));
  const setS = (id: number, patch: Partial<Souscripteur>) => set({ souscripteurs: d.souscripteurs.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const ajouter = () => set({ souscripteurs: [...d.souscripteurs, vide(Math.max(0, ...d.souscripteurs.map((s) => s.id)) + 1)] });
  const retirer = (id: number) => set({ souscripteurs: d.souscripteurs.filter((s) => s.id !== id) });

  const c = useMemo(() => {
    const capital = num(d.capital);
    const lignes = d.souscripteurs.filter((s) => s.nom.trim() || s.souscrit || s.verse);
    const totalSouscrit = lignes.reduce((t, s) => t + num(s.souscrit), 0);
    const totalVerse = lignes.reduce((t, s) => t + num(s.verse), 0);
    const minFraction = MINIMUM[d.forme];
    const minimum = minFraction === null ? 0 : capital * minFraction;
    const ok = (b: boolean) => (b ? "ok" : "ko");
    return {
      capital,
      lignes,
      totalSouscrit,
      totalVerse,
      minFraction,
      minimum,
      checks: [
        { label: "Total souscrit égal au capital", etat: ok(capital > 0 && Math.abs(totalSouscrit - capital) < 0.005), detail: `${eur.format(totalSouscrit)} / ${eur.format(capital)}` },
        {
          label: minFraction === null ? "Versement minimum : aucun minimum légal particulier pour cette forme" : `Versement minimum respecté (${Math.round(minFraction * 100)} % du capital)`,
          etat: minFraction === null ? "info" : ok(totalVerse + 0.005 >= minimum && totalVerse > 0),
          detail: minFraction === null ? eur.format(totalVerse) : `${eur.format(totalVerse)} ≥ ${eur.format(minimum)}`,
        },
        { label: "Aucun versé supérieur au souscrit", etat: ok(lignes.every((s) => num(s.verse) <= num(s.souscrit) + 0.005)), detail: "" },
        { label: "Lignes complètes (nom, domicile, montants)", etat: ok(lignes.length > 0 && lignes.every((s) => s.nom.trim() && s.domicile.trim() && s.souscrit !== "" && s.verse !== "")), detail: `${lignes.length} souscripteur(s)` },
        { label: "Dénomination, siège et date renseignés", etat: ok(Boolean(d.denomination.trim() && d.siege.trim() && d.date)), detail: "" },
      ],
    };
  }, [d]);

  const toutOk = c.checks.every((k) => k.etat !== "ko");

  return (
    <main className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      {/* ---------- saisie (masquée à l'impression) ---------- */}
      <div className="mx-auto flex max-w-4xl flex-col gap-6 print:hidden">
        <div>
          <a href="/" className="text-xs text-gray-400 hover:text-blue-600">← Tous les projets</a>
          <h1 className="text-2xl font-bold tracking-tight">Dépôt de capital · Souscripteurs</h1>
          <p className="text-sm text-gray-500">Remplis les cases, les contrôles passent au vert, puis imprime la liste. Le brouillon est conservé dans ce navigateur.</p>
        </div>

        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-2">
          <label className="label md:col-span-2">Dénomination sociale<input className="input" value={d.denomination} onChange={(e) => set({ denomination: e.target.value })} placeholder="SAS EXEMPLE" /></label>
          <label className="label">Forme<select className="input" value={d.forme} onChange={(e) => set({ forme: e.target.value as Forme })}>{FORMES.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className="label">Capital social (€)<input className="input" type="number" min={0} step="0.01" value={d.capital} onChange={(e) => set({ capital: e.target.value })} placeholder="10000" /></label>
          <label className="label md:col-span-2">Siège social<input className="input" value={d.siege} onChange={(e) => set({ siege: e.target.value })} placeholder="12 rue Exemple, 75000 Paris" /></label>
          <label className="label">Date du dépôt<input className="input" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></label>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="panel-title !mb-0">Souscripteurs</h2>
            <button className="btn-primary" onClick={ajouter}>+ Ajouter</button>
          </div>
          <div className="space-y-2">
            {d.souscripteurs.map((s, i) => (
              <div key={s.id} className="grid grid-cols-1 gap-2 rounded-md border border-gray-100 bg-gray-50 p-2 md:grid-cols-[2fr_3fr_1fr_1fr_auto]">
                <input className="input" placeholder={`Nom, prénom (ou dénomination) ${i + 1}`} value={s.nom} onChange={(e) => setS(s.id, { nom: e.target.value })} />
                <input className="input" placeholder="Domicile (ou siège)" value={s.domicile} onChange={(e) => setS(s.id, { domicile: e.target.value })} />
                <input className="input" type="number" min={0} step="0.01" placeholder="Souscrit €" value={s.souscrit} onChange={(e) => setS(s.id, { souscrit: e.target.value })} />
                <input className="input" type="number" min={0} step="0.01" placeholder="Versé €" value={s.verse} onChange={(e) => setS(s.id, { verse: e.target.value })} />
                <button className="btn text-red-600" title="Retirer" onClick={() => retirer(s.id)}>×</button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="panel-title">Contrôles</h2>
          <ul className="space-y-1">
            {c.checks.map((k) => (
              <li key={k.label} className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${k.etat === "ok" ? "bg-emerald-50 text-emerald-800" : k.etat === "ko" ? "bg-red-50 text-red-800" : "bg-gray-50 text-gray-600"}`}>
                <span>{k.etat === "ok" ? "✓" : k.etat === "ko" ? "✗" : "ℹ"} {k.label}</span>
                <span className="text-xs">{k.detail}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              Total souscrit : <b>{eur.format(c.totalSouscrit)}</b> · Total versé : <b>{eur.format(c.totalVerse)}</b>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => { if (window.confirm("Effacer ce dossier ?")) setD(initial()); }}>Nouveau dossier</button>
              <button className="btn-primary" disabled={!toutOk} onClick={() => window.print()}>Imprimer la liste</button>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- liste imprimable ---------- */}
      <section className="mx-auto mt-8 hidden max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 print:mt-0 print:block print:max-w-none print:border-0 print:p-0" aria-label="Liste des souscripteurs">
        <h1 className="text-xl font-bold">Liste des souscripteurs</h1>
        <p className="mt-1 text-sm">
          {d.denomination || "—"} ({d.forme}) · capital social {eur.format(c.capital)} · siège : {d.siege || "—"}
          {d.date ? ` · dépôt du ${dateFr(d.date)}` : ""}
        </p>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Nom, prénom / dénomination</th>
              <th className="py-1 pr-2">Domicile / siège</th>
              <th className="py-1 pr-2 text-right">Souscrit</th>
              <th className="py-1 text-right">Versé</th>
            </tr>
          </thead>
          <tbody>
            {c.lignes.map((s, i) => (
              <tr key={s.id} className="border-b border-gray-300">
                <td className="py-1 pr-2">{i + 1}</td>
                <td className="py-1 pr-2">{s.nom}</td>
                <td className="py-1 pr-2">{s.domicile}</td>
                <td className="py-1 pr-2 text-right">{eur.format(num(s.souscrit))}</td>
                <td className="py-1 text-right">{eur.format(num(s.verse))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-800 font-semibold">
              <td className="py-1" colSpan={3}>Total</td>
              <td className="py-1 pr-2 text-right">{eur.format(c.totalSouscrit)}</td>
              <td className="py-1 text-right">{eur.format(c.totalVerse)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-4 text-xs text-gray-500">Document de préparation établi par la société. {c.lignes.length} souscripteur(s).</p>
      </section>
    </main>
  );
}
