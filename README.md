# 💰 Mes Finances

> Application web de gestion de finances personnelles — design dark fintech, données stockées dans votre propre Google Sheets.

---

## Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation et déploiement](#installation-et-déploiement)
- [Partager l'application](#partager-lapplication)
- [Structure des fichiers](#structure-des-fichiers)
- [Google Sheets — structure des données](#google-sheets--structure-des-données)
- [Règle 10/30/60](#règle-103060)
- [Export des données](#export-des-données)
- [Catégories disponibles](#catégories-disponibles)
- [Personnalisation](#personnalisation)
- [Questions fréquentes](#questions-fréquentes)

---

## Aperçu

**Mes Finances** est une application web légère (HTML + CSS + JavaScript pur, sans framework) qui vous permet de suivre vos entrées et dépenses au quotidien. Toutes vos données sont stockées dans votre propre Google Sheets — vous en restez le seul propriétaire. L'application fonctionne sur PC, téléphone et tablette.

**Principe clé :** chaque utilisateur déploie son propre backend Google Apps Script connecté à son Google Drive. Les données de chacun sont totalement isolées.

---

## Fonctionnalités

### Tableau de bord
- Indicateurs clés du mois sélectionné : solde, entrées, dépenses
- Navigation mois par mois (antérieur / suivant)
- Graphique donut de répartition des dépenses par catégorie
- Histogramme d'évolution sur les 6 derniers mois
- Liste des transactions récentes du mois

### Nouvelle opération
- Saisie rapide d'une entrée ou d'une dépense
- Sélection du type, de la catégorie, du montant, de la date et d'une note optionnelle
- Enregistrement direct dans Google Sheets en temps réel

### Historique
- Tableau complet de toutes les transactions
- Filtres combinables : recherche textuelle, type, catégorie, mois
- Tri par colonne (date, intitulé, type, montant)
- Résumé dynamique des totaux filtrés
- Suppression d'une transaction (avec confirmation)

### Statistiques
- Graphique d'évolution sur 12 mois (entrées vs dépenses)
- Classement des 5 principales dépenses par catégorie
- Classement des 5 principales entrées par catégorie
- Jauge du taux d'épargne global
- **Encadré Règle 10/30/60** : dîmes, épargne et budget dépenses recommandés

### Export
- **CSV** : toutes les transactions au format tableur universel
- **Excel (.xlsx)** : fichier Excel avec colonnes Dîmes et Épargne incluses
- **PDF** : impression optimisée de la page Statistiques (via `Ctrl+P` → Enregistrer en PDF)

---

## Architecture

```
┌─────────────────────────────┐       ┌──────────────────────────┐
│      Navigateur              │       │     Google Cloud          │
│                             │       │                          │
│  index.html                 │──────▶│  Google Apps Script      │
│  app.js          ◀──────────│       │  (votre Code.gs déployé) │
│  style.css                  │       │          │               │
└─────────────────────────────┘       │          ▼               │
                                       │  Google Sheets           │
                                       │  (vos données)           │
                                       └──────────────────────────┘
```

- **Frontend** : 3 fichiers statiques, aucune dépendance serveur, hébergeable n'importe où (GitHub Pages, Netlify, dossier local…)
- **Backend** : Google Apps Script déployé comme Web App — gratuit, sans serveur à maintenir
- **Base de données** : Google Sheets dans votre Google Drive — vous gardez le contrôle total
- **Pas de compte** à créer, pas de mot de passe supplémentaire

---

## Installation et déploiement

### Étape 1 — Déployer le backend (Google Apps Script)

1. Rendez-vous sur [script.google.com](https://script.google.com)
2. Cliquez sur **Nouveau projet**
3. Nommez le projet `Mes Finances`
4. Remplacez tout le contenu de `Code.gs` par le contenu du fichier `Code.gs` fourni
5. Cliquez sur **Déployer → Nouvelle application Web**
   - *Description* : `Mes Finances v2`
   - *Exécuter en tant que* : **Moi**
   - *Accès* : **Tout le monde**
6. Autorisez les permissions demandées par Google
7. **Copiez l'URL** générée (format : `https://script.google.com/macros/s/.../exec`)

> ⚠️ **Important** : à chaque modification de `Code.gs`, vous devez créer un **nouveau déploiement** (et non modifier l'existant) pour que les changements soient pris en compte.

### Étape 2 — Ouvrir l'application

1. Ouvrez `index.html` dans votre navigateur (double-clic, ou hébergez-le en ligne)
2. L'écran de configuration s'affiche au premier lancement
3. Collez l'URL Apps Script copiée à l'étape 1
4. Cliquez sur **Connecter mon Google Sheet**
5. L'application se connecte, crée automatiquement la feuille `Transactions` dans votre Sheets, et charge vos données

### Étape 3 — Accès multi-appareils

Sur votre téléphone ou un autre appareil : ouvrez le même `index.html` (ou le lien hébergé), collez la **même URL Apps Script** lors de la configuration. Toutes vos données se synchronisent depuis Google Sheets.

---

## Partager l'application

Chaque utilisateur dispose de **ses propres données** grâce à son propre Google Apps Script.

**Pour partager l'application à quelqu'un :**

1. Envoyez-lui les fichiers `index.html`, `app.js` et `style.css` (ou un lien hébergé)
2. Il suit les étapes de déploiement ci-dessus avec **son propre compte Google**
3. Ses données iront dans **son propre Google Sheets** — complètement isolées des vôtres

Il n'y a aucune base de données centrale. Chacun est autonome.

---

## Structure des fichiers

```
mes-finances/
├── index.html     — Interface utilisateur (4 vues : dashboard, saisie, historique, statistiques)
├── app.js         — Logique applicative (navigation, formulaire, graphiques, API, export)
├── style.css      — Design system dark fintech (variables CSS, composants, responsive, print)
└── Code.gs        — Backend Google Apps Script (API REST légère sur Google Sheets)
```

### Dépendances externes (chargées via CDN, aucune installation)
- [Chart.js 4.4](https://www.chartjs.org/) — graphiques
- [SheetJS (xlsx)](https://sheetjs.com/) — export Excel, chargé à la demande uniquement
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — typographie

---

## Google Sheets — structure des données

La feuille `Transactions` est créée automatiquement au premier déploiement avec les colonnes suivantes :

| Colonne | Description |
|---|---|
| `ID` | Identifiant unique de la transaction |
| `Date` | Date au format `YYYY-MM-DD` |
| `Intitulé` | Description de l'opération |
| `Montant` | Valeur numérique positive (en FCFA) |
| `Type` | `Entrée` ou `Dépense` |
| `Catégorie` | Catégorie choisie lors de la saisie |
| `Note` | Commentaire optionnel |
| `Timestamp` | Horodatage ISO de la création ou mise à jour |
| `Dîmes (10%)` | Calculé automatiquement sur les Entrées uniquement |
| `Épargne (30%)` | Calculé automatiquement sur les Entrées uniquement |

---

## Règle 10/30/60

L'application applique discrètement une règle de répartition recommandée sur chaque entrée d'argent :

| Part | Destination | Calcul automatique |
|---|---|---|
| **10%** | Dîmes | Oui — colonne dédiée dans Sheets |
| **30%** | Épargne | Oui — colonne dédiée dans Sheets |
| **60%** | Dépenses courantes | Budget maximum recommandé |

Cette règle est visible dans la page **Statistiques**, dans l'encadré "Répartition recommandée". Un indicateur coloré signale si vos dépenses restent dans les 60% (✓ vert) ou les dépassent (⚠️ rouge).

---

## Export des données

Le bouton **Export** (disponible en haut de l'interface et en bas de la page Statistiques) propose trois formats :

### CSV
Export de toutes les transactions au format `.csv` avec encodage UTF-8. Compatible avec Excel, Google Sheets, LibreOffice.

### Excel (.xlsx)
Export complet incluant les colonnes **Dîmes (10%)** et **Épargne (30%)** pour chaque entrée. La librairie SheetJS est chargée à la demande (pas d'impact sur les performances au chargement).

### PDF (impression)
Déclenche l'impression du navigateur sur la page Statistiques. Pour obtenir un PDF :
- **Sur PC** : `Ctrl+P` → sélectionner "Enregistrer en PDF" comme imprimante
- **Sur Mac** : `Cmd+P` → "PDF" en bas à gauche
- **Sur téléphone** : bouton "Partager" → "Imprimer" → "Enregistrer en PDF"

La vue impression est optimisée : sidebar et barres de navigation masquées, fond blanc, graphiques préservés.

---

## Catégories disponibles

### Entrées
| Catégorie | |
|---|---|
| 💼 Salaire | |
| 🏪 Vente / Prestation de service | |
| 🎁 Dons | |
| 🤝 Prêt | |
| 💰 Autres | |

### Dépenses
| Catégorie | |
|---|---|
| 🚌 Transport | |
| 🧴 Toilettes | |
| 💡 Électricité | |
| 🏠 Loyer | |
| 💳 Dettes | |
| 📱 Crédit de communication | |
| 🛒 Dépenses courantes | |
| 🚨 Urgences | |
| 🎭 Loisirs | |
| 🤝 Bonnes œuvres | |
| 📦 Autres | |

---

## Personnalisation

### Modifier les catégories
Dans `app.js`, localisez le bloc `CONFIG.CATEGORIES` en début de fichier. Ajoutez, retirez ou renommez des catégories en respectant le format `{ value: 'Nom', icon: '🔤' }`.

### Changer la devise
Recherchez `FCFA` dans `app.js` (fonction `fmt`) et `index.html` pour remplacer par votre devise.

### Changer la règle 10/30/60
Dans `app.js`, recherchez les valeurs `0.10` et `0.30` dans la fonction `refreshAnalytics` et dans `Code.gs` pour ajuster les pourcentages. La valeur `0.60` (60% max pour les dépenses) se calcule en conséquence.

### Changer de Google Sheet
Dans la sidebar, cliquez sur **Changer de Sheet** pour saisir une nouvelle URL Apps Script.

---

## Questions fréquentes

**L'application est-elle gratuite ?**
Oui, entièrement. Google Apps Script, Google Sheets et Google Drive sont gratuits dans les limites d'usage personnel standard.

**Mes données sont-elles sécurisées ?**
Vos données restent dans votre Google Drive personnel. L'application ne passe par aucun serveur tiers. L'URL Apps Script est stockée uniquement dans le `localStorage` de votre navigateur.

**Que se passe-t-il si je perds l'URL Apps Script ?**
Rendez-vous sur [script.google.com](https://script.google.com), ouvrez votre projet `Mes Finances`, allez dans **Déployer → Gérer les déploiements** et copiez à nouveau l'URL.

**Puis-je utiliser l'application hors connexion ?**
L'application nécessite une connexion internet pour lire et écrire dans Google Sheets. Sans connexion, les données ne seront pas accessibles.

**Les données sont-elles perdues si je vide le cache ?**
Non. Le cache ne contient que l'URL de configuration. Toutes vos transactions sont dans Google Sheets — elles sont récupérées à la prochaine connexion.

**Comment migrer des données existantes ?**
Vous pouvez importer directement des données dans la feuille `Transactions` de votre Google Sheets en respectant l'ordre des colonnes, ou utiliser la fonction `bulkImport` de l'API Apps Script.

---

*Mes Finances — Application personnelle de gestion budgétaire*
