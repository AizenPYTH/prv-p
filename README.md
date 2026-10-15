# Mes outils

Un seul site Next.js qui héberge plusieurs projets, chacun à sa propre adresse :

| Adresse | Projet | Où est le code |
|---|---|---|
| `/` | Page d'accueil (hub) avec une tuile par projet | `src/app/page.tsx` |
| `/editor` | Smart Document Editor (ci-dessous) | `src/app/editor`, `src/components`, `src/lib` |
| `/amaz` | Amaz · Générateur de factures, copié **tel quel** depuis le dépôt `amaz` | pages et assets : `public/amaz` ; fonctions : `src/amaz/api` (inchangées), exposées à `/api/extract`, `/api/profil`, `/api/donnees` via `src/lib/nodeHandler.ts` |
| `/depot` | Dépôt de capital · Souscripteurs : saisie société + souscripteurs, contrôles (total = capital, minimum libéré selon la forme, versé ≤ souscrit), liste imprimable. Équivalent web du classeur Excel ; ce n'est pas un certificat (aucune banque, aucun signataire). | `src/app/depot/page.tsx` |

Variables d'environnement d'Amaz à recopier dans le projet Vercel : `OPENAI_API_KEY` (et `OPENAI_MODEL` en option), `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_*`) et `CODE_ACCES`. Voir `src/amaz/README.md`.

### Ajouter un autre projet

- **Site statique (HTML/JS/CSS)** : copie-le dans `public/<nom>/`, ajoute une réécriture `/<nom>` → `/<nom>/index.html` dans `next.config.ts`, et une tuile dans `src/app/page.tsx`. Ses fonctions `api/` (style Vercel `(req, res)`) se branchent comme celles d'Amaz : un fichier `src/app/api/<route>/route.ts` de trois lignes avec `adaptNodeHandler`.
- **Application Next.js** : pose ses pages dans `src/app/<nom>/` et ses routes API dans `src/app/api/<nom>/`.

---

# Smart Document Editor

Un « Canva pour documents administratifs », volontairement simple :
**Importer → Détecter → Modifier → Enregistrer → Exporter**.

L'outil est générique : il ne connaît aucun document en particulier. Utilise-le uniquement sur des documents que tu es autorisé à modifier.

## Fonctionnement

1. **Import** : PDF, JPG ou PNG (bouton ou glisser-déposer).
2. **Détection** :
   - PDF avec texte → extraction des positions via PDF.js.
   - Image ou PDF scanné → OCR dans le navigateur (Tesseract.js, fra+eng).
   - Classification des champs (date, montant, nom, adresse, IBAN, référence, n° de facture, téléphone, email, SIREN…) :
     - par **Claude** si `ANTHROPIC_API_KEY` est configurée côté serveur,
     - sinon par des **heuristiques locales** (libellés « Nom : valeur », expressions régulières).
3. **Éditeur** : le document est affiché au centre, chaque champ détecté est une zone cliquable positionnée sur le texte d'origine. Double-clic pour éditer directement sur le document. « Ajouter une zone » pour créer un champ manuellement.
4. **Panneau de droite** : nom du champ, type, valeur, « Enregistrer cette valeur », liste des valeurs enregistrées (un clic = appliquée).
5. **Assistant IA** : propose les champs un par un, comprend `passer`, `Libellé = valeur`, `contact Nom`. Fonctionne sans clé (mode local) ou avec Claude.
6. **Contacts / Entreprises** : bibliothèque (nom, adresse, IBAN, banque, email, téléphone, SIREN). « Appliquer » remplit les champs correspondants.
7. **Modèles** : enregistre le document avec ses zones ; à la réouverture tout est déjà détecté.
   **Mes documents** : chaque document ouvert est sauvegardé automatiquement avec ses modifications (IndexedDB) et peut être rouvert pour continuer l'édition.
8. **Export PDF** : le fichier d'origine est conservé (mise en page, polices) ; chaque valeur modifiée est peinte par-dessus l'originale, à la même position et à la même taille, avec la couleur de fond échantillonnée sur le document.
   La police d'origine de chaque zone est détectée (Arial/Helvetica, Calibri, Times New Roman, Courier New, Verdana) et reproduite avec des polices libres métriquement compatibles embarquées dans `public/fonts` (Liberation, Carlito, DejaVu). Choix manuel possible par zone, ainsi que la taille et le gras.
   Les zones peuvent être déplacées à la souris : le texte d'origine est masqué et la valeur est dessinée au nouvel emplacement.

Les valeurs enregistrées et contacts sont dans le `localStorage` ; les documents et modèles (avec le fichier) dans IndexedDB du navigateur. Pas de base de données serveur.

### Retrouver ses fichiers sur un autre ordinateur

Onglet **Sauvegarde / Sync** (ou bouton sur l'accueil) :

- **Sauvegarde fichier** : « Exporter tout » télécharge un `.json` (documents, modèles, contacts, valeurs). « Importer un fichier » le recharge ailleurs. Aucune configuration.
- **Synchronisation cloud** : connecte un store **Vercel Blob** au projet (Vercel → Storage → Create → Blob), la variable `BLOB_READ_WRITE_TOKEN` est ajoutée automatiquement. Choisis ensuite un code de synchronisation (6 caractères minimum) : « Envoyer vers le cloud » sur un PC, « Récupérer depuis le cloud » sur l'autre. Les fichiers sont stockés en blobs privés sous un chemin dérivé du SHA-256 du code ; quiconque connaît le code accède à l'espace.

## Lancer

```bash
npm install
cp .env.example .env.local   # optionnel : renseigner ANTHROPIC_API_KEY pour activer Claude
npm run dev
```

Puis ouvrir http://localhost:3000 (hub), http://localhost:3000/editor ou http://localhost:3000/amaz.

## Stack

Next.js (App Router) · TypeScript · Tailwind · PDF.js · Tesseract.js · pdf-lib · Anthropic SDK (`claude-opus-5-5`).

## Structure

```
src/app/api/status      → l'IA serveur est-elle configurée ?
src/app/api/classify    → classification des segments par Claude (sortie JSON structurée)
src/app/api/assistant   → assistant conversationnel (Claude)
src/app/api/sync        → synchronisation cloud (Vercel Blob : liste, lecture, jetons d'upload, suppression)
src/lib/sync.ts         → sauvegarde fichier + client de synchronisation
src/lib/pdf.ts          → rendu des pages + extraction du texte positionné (PDF.js)
src/lib/ocr.ts          → OCR Tesseract pour images / scans
src/lib/detect.ts       → détection heuristique des champs
src/lib/ai.ts           → appels IA côté client + assistant local (sans clé)
src/lib/exportPdf.ts    → export PDF (pdf-lib)
src/lib/storage.ts      → localStorage (valeurs, contacts) + IndexedDB (documents, modèles)
src/lib/db.ts           → mini wrapper IndexedDB
src/components/         → Editor, DocumentView, FieldPanel, AssistantPanel, ContactsPanel, TemplatesPanel
```

## Limites connues (MVP)

- L'export recouvre le texte d'origine ; il reste présent dans le flux du PDF sous le rectangle de fond (extractible par copier-coller). Pour un remplacement « réel », il faudrait réécrire le contenu du PDF.
- Les polices sont des équivalents libres (mêmes métriques, dessin très proche), pas les polices propriétaires d'origine.
- Documents et modèles restent dans le navigateur qui les a créés (pas de synchronisation entre appareils).
- L'OCR télécharge ses données de langue au premier usage (quelques Mo).
