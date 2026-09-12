# Site du Handball Islois

Site vitrine du club de handball de L'Isle-sur-la-Sorgue, construit avec
[Astro](https://astro.build) (100 % statique, sans backend).

## Commandes

| Commande          | Action                                       |
| :----------------- | :-------------------------------------------- |
| `npm install`       | Installe les dépendances                      |
| `npm run dev`       | Lance le serveur de dev sur `localhost:4321`  |
| `npm run build`     | Build le site en production dans `./dist/`    |
| `npm run preview`   | Prévisualise le build avant déploiement       |

Le déploiement se fait automatiquement sur GitHub Pages via
`.github/workflows/deploy.yml` à chaque push sur `main`.

## Structure

- `src/pages/` — une page par route (`index.astro`, `le-club.astro`, `equipes.astro`, `agenda.astro`)
- `src/components/` — composants réutilisables (Header, Footer, cartes, etc.)
- `src/styles/tokens.css` — la seule source de couleurs du site
- `src/data/` — fichiers de configuration de contenu (ex : équipes/agenda)
- `src/lib/` — logique de récupération de données (ex : parsing iCal)

## Agenda des matchs (calendriers FFHandball)

L'agenda (`/agenda`, bandeau "prochain match à domicile" sur la homepage,
boutons sur `/equipes`) est alimenté par les flux iCal officiels de la
FFHandball, un flux par compétition. Ces flux sont lus au moment du build ;
le site ne les modifie jamais.

### Ajouter une nouvelle équipe

Tout se passe dans **`src/data/agenda-teams.config.ts`** — aucune autre
logique à toucher. Ajoutez une entrée au tableau `agendaTeams` :

```ts
{
  nomAffiche: "U18 masculins",      // nom affiché sur le site
  urlIcs: "https://competition-calendar.ffhandball.fr/c-XXXXX/s-XXXX.ics",
  matchLabel: "Handball Islois",    // tel qu'écrit dans le flux (voir plus bas)
},
```

- **`nomAffiche`** : le nom de la catégorie tel qu'il doit apparaître sur le
  site. Pour qu'un bouton "Ajouter à mon agenda" apparaisse automatiquement
  sur la carte correspondante de `/equipes`, `nomAffiche` doit commencer par
  le même texte que le nom de la catégorie dans `equipes.astro` (ex :
  `"Seniors masculins 1"` matche la carte `"Seniors masculins"`).
- **`urlIcs`** : l'URL du flux iCal FFHandball de la compétition. Récupérable
  depuis l'espace club FFHandball ou la page de la compétition.
- **`matchLabel`** : le texte exact (insensible à la casse) utilisé dans le
  flux pour repérer CETTE équipe précisément. En général `"Handball Islois"`.
  Si plusieurs équipes du club sont engagées dans la même compétition (donc
  dans le même flux, comme les Seniors masculins 1 et 2), donnez à chacune
  son propre `matchLabel` exact (`"Handball Islois 1"`, `"Handball Islois 2"`)
  pour qu'elles ne soient jamais confondues — et réutilisez la même `urlIcs`
  pour les deux.
- **`urlClassement`** (optionnel) : lien vers le classement de la
  compétition. Laissez-le vide : il est déduit automatiquement de l'URL des
  rencontres présentes dans le flux (la FFHandball encode la poule dans
  cette URL). Ne renseignez ce champ que si la déduction automatique ne
  fonctionne pas pour cette compétition.

Une fois l'entrée ajoutée :
- elle apparaît automatiquement dans la liste des prochains matchs de `/agenda`,
- son bouton "Ajouter à mon agenda" apparaît sur `/agenda` et, si le nom
  matche, sur la carte correspondante de `/equipes`,
- son lien de classement apparaît en bas de `/agenda`,
- elle peut faire remonter le bandeau "prochain match à domicile" de la
  homepage si son prochain match est à domicile.

Rien d'autre à modifier : ni la logique de récupération (`src/lib/agenda.ts`),
ni les pages, ni les composants.

### Fiabilité

Un flux indisponible ou mal formé ne fait jamais planter le build : l'équipe
concernée est simplement absente de l'affichage (un avertissement est
seulement écrit dans les logs du build). Voir `fetchFeed()` dans
`src/lib/agenda.ts`.

### Limite connue

Le site étant 100 % statique, l'agenda n'est à jour qu'au moment du build
(à chaque déploiement, donc à chaque push sur `main`). Un flux FFHandball
qui change entre deux déploiements ne sera visible qu'au déploiement
suivant. Si besoin d'un agenda toujours à jour sans repasser par un push,
on peut ajouter un déclenchement planifié (`schedule:` cron) dans
`.github/workflows/deploy.yml` pour rebuilder périodiquement.
