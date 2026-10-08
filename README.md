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

## Lancer

```bash
npm install
cp .env.example .env.local   # optionnel : renseigner ANTHROPIC_API_KEY pour activer Claude
npm run dev
```

Puis ouvrir http://localhost:3000.

## Stack

Next.js (App Router) · TypeScript · Tailwind · PDF.js · Tesseract.js · pdf-lib · Anthropic SDK (`claude-opus-5-5`).

## Structure

```
src/app/api/status      → l'IA serveur est-elle configurée ?
src/app/api/classify    → classification des segments par Claude (sortie JSON structurée)
src/app/api/assistant   → assistant conversationnel (Claude)
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
