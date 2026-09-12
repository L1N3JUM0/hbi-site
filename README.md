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
- `src/content/equipes/`, `src/content/articles/`, `src/content/partenaires/`,
  `src/content/photos-accueil/` — content collections Astro (un fichier par
  équipe/article/partenaire/photo)
- `src/content.config.ts` — schéma de ces collections
- `src/data/` — fichiers de configuration (ex : liaison agenda/équipe)
- `src/lib/` — logique de récupération de données (ex : parsing iCal)

## Équipes (collection de contenu)

Chaque équipe/catégorie est un fichier Markdown indépendant dans
**`src/content/equipes/`** (un fichier = une équipe), défini par le schéma de
**`src/content.config.ts`**. C'est une vraie content collection Astro,
conçue pour qu'un futur back-office Sveltia CMS puisse être branché dessus
sans aucune restructuration : il suffira de pointer la config de Sveltia sur
`src/content/equipes/` avec les mêmes champs.

Champs de chaque fichier :

| Champ         | Rôle                                                                 |
| :------------ | :-------------------------------------------------------------------- |
| `nom`         | Nom affiché (homepage, `/equipes`)                                    |
| `type`        | `competition` \| `decouverte` \| `inclusion` \| `transversal`         |
| `slug`        | Identifiant stable : ancre `/equipes#slug` **et** clé de liaison avec `agendaTeams[].equipeSlug` (voir plus bas) — ne jamais le changer une fois publié |
| `ordre`       | Ordre d'affichage au sein de son `type`                               |
| `horaires`    | Jour(s) et horaires d'entraînement                                    |
| `encadrants`  | Encadrant(s)                                                          |
| `tarif`       | Tarif de licence                                                      |
| `description` | 1-2 phrases : survol de la carte sur la homepage ET texte sur `/equipes` |
| `photoProfil` | Photo utilisée sur la carte homepage ET en tête de la page équipe (voir "Remplacer une photo" ci-dessous) |
| `galerie`     | Liste de photos du carrousel sur `/equipes` (peut inclure ou non `photoProfil`) |

### Remplacer une photo (ou en ajouter une vraie)

Les photos de la plupart des équipes sont des **placeholders temporaires**
(images génériques du club, réutilisées sur plusieurs équipes) — chaque
fichier contient un commentaire `# Photos temporaires...` au-dessus du champ
`photoProfil` pour le rappeler. Pour remplacer une photo par une vraie photo
de l'équipe (à la main ; via Sveltia CMS il suffit de glisser-déposer, voir
`GUIDE-EDITION.md`) :

1. Déposez le fichier image dans `src/assets/` (ex : `src/assets/u9-mixtes-1.jpg`).
   Compressez-le d'abord si besoin (< 200 Ko, cf. contraintes du projet).
2. Dans `src/content/equipes/<équipe>.md`, remplacez le chemin correspondant
   dans `photoProfil:` et/ou dans la liste `galerie:` par
   `"../../assets/u9-mixtes-1.jpg"` (chemin relatif au fichier `.md`, donc
   toujours préfixé par `../../assets/`).
3. Supprimez le commentaire "Photos temporaires" une fois toutes les photos
   d'une équipe remplacées par de vraies photos.

`photoProfil` est utilisée sur la homepage et en tête de la page équipe ;
`galerie` alimente le carrousel + la visionneuse plein écran sur `/equipes`.
Chaque équipe peut avoir autant de photos que voulu dans `galerie` (au moins
1), qu'elle reprenne ou non la photo de `photoProfil`.

Astro optimise automatiquement ces images au build (AVIF/WebP, tailles
responsives) grâce au champ `image()` du schéma — c'est pour ça que le
chemin doit pointer vers `src/assets/` (traité par Astro) et non vers
`public/` (fichiers bruts, non optimisés). Sveltia CMS (voir plus bas) est
configuré pour respecter cette même contrainte : son sélecteur d'image
écrit toujours un chemin relatif vers `src/assets/`.

### Ajouter une nouvelle équipe

Créez un fichier `src/content/equipes/<slug>.md` avec les champs ci-dessus.
Elle apparaît automatiquement sur la homepage et `/equipes`, triée par
`ordre` au sein de son `type`. Pour lui associer un flux de calendrier, voir
la section suivante.

## Vie du club (articles)

Même principe que les équipes : chaque article est un fichier Markdown
indépendant dans **`src/content/articles/`**, défini par le schéma de
`src/content.config.ts`. Contrairement aux équipes, le corps du fichier
Markdown (sous le frontmatter) EST le contenu de l'article — pas de champ
séparé à remplir, on écrit le texte normalement.

Champs du frontmatter :

| Champ        | Rôle                                                      |
| :----------- | :---------------------------------------------------------- |
| `titre`      | Titre de l'article                                          |
| `date`       | Date de publication (`AAAA-MM-JJ`) — détermine l'ordre d'affichage (le plus récent en premier) |
| `couverture` | Photo de couverture (même mécanique que `photoProfil` des équipes : chemin relatif vers `src/assets/`, ex. `"../../assets/ma-photo.jpg"`) |
| `extrait`    | 1-2 phrases affichées dans la liste `/vie-du-club`          |
| `slug`       | Identifiant stable : URL `/vie-du-club/<slug>`               |

### Publier un nouvel article

Créez un fichier `src/content/articles/<slug>.md` avec ce frontmatter, puis
écrivez le texte de l'article en dessous (Markdown normal : paragraphes,
gras, liens...). Il apparaît automatiquement dans `/vie-du-club`, trié par
date, avec sa propre page `/vie-du-club/<slug>`.

Deux articles d'exemple (`tournoi-halloween.md`, `moment-en-famille.md`)
sont fournis avec les photos déjà présentes dans le projet, à remplacer par
de vraies actualités dès que le club en aura (un commentaire au-dessus de
`couverture` le rappelle dans chaque fichier).

### Instagram

La carte "Suivez-nous sur Instagram" de `/vie-du-club` est un simple lien
externe pour l'instant (pas d'intégration technique du flux) : le compte du
club doit d'abord passer en compte professionnel pour permettre une
intégration propre et conforme RGPD (récupération côté build, pas d'embed
tiers — voir les contraintes du projet). Une fois que ce sera fait, cette
carte est l'endroit où brancher un vrai aperçu des dernières publications.

## Photos de la page d'accueil

Le bandeau "La vie du club, en images" de la homepage (composant
`PhotoBand.astro`) lit la collection **`src/content/photos-accueil/`** — un
fichier Markdown par photo, avec trois champs : `image` (chemin relatif vers
`src/assets/`), `alt` (texte alternatif, accessibilité) et `ordre` (ordre de
passage dans le carrousel). Éditable depuis Sveltia CMS (rubrique "Photos de
la page d'accueil") : on peut y ajouter ou retirer une photo librement.

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
  equipeSlug: "u18-masculins",      // doit correspondre au `slug` du fichier dans src/content/equipes/
  urlIcs: "https://competition-calendar.ffhandball.fr/c-XXXXX/s-XXXX.ics",
  matchLabel: "Handball Islois",    // tel qu'écrit dans le flux (voir plus bas)
},
```

- **`nomAffiche`** : le nom de l'équipe tel qu'il doit apparaître sur le site.
- **`equipeSlug`** : identifiant explicite qui doit être **strictement égal**
  au champ `slug` d'un fichier de `src/content/equipes/` — c'est ce qui relie
  de façon fiable une équipe à son flux (aucune correspondance approximative
  sur le nom). Plusieurs entrées peuvent partager le même `equipeSlug` quand
  plusieurs équipes du club sont rattachées à la même catégorie/carte (ex :
  Seniors masculins 1 et 2 pointent toutes les deux vers `"seniors-masculins"`).
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
- son bouton "Ajouter à mon agenda" apparaît sur `/agenda` et, grâce à
  `equipeSlug`, sur la section correspondante de `/equipes`,
- ses 3 prochains matchs s'affichent directement dans sa section sur `/equipes`,
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

### Fraîcheur des données

Le site étant 100 % statique, l'agenda n'est à jour qu'au moment du build.
En plus du build à chaque push sur `main`, `.github/workflows/deploy.yml`
déclenche un rebuild automatique chaque jour (`schedule: cron`) pour que les
matchs à venir restent à jour même sans nouveau commit.

## Back-office (Sveltia CMS)

`public/admin/` contient l'interface d'édition à destination des bénévoles
non-techniques (voir `GUIDE-EDITION.md` pour le mode d'emploi). Elle est
servie telle quelle par Astro (fichiers statiques, aucune génération) et se
branche directement sur les content collections ci-dessus via
`public/admin/config.yml` — mêmes champs, aucune restructuration.

- **`public/admin/index.html`** charge le bundle de Sveltia CMS depuis un
  CDN (`unpkg`), version figée volontairement pour éviter qu'une mise à jour
  amont ne change l'interface sans prévenir. Pour monter de version,
  changez le numéro dans les deux endroits (`@sveltia/cms@X.Y.Z`) après
  avoir vérifié le changelog.
- **`public/admin/config.yml`** définit les 4 collections éditables
  (`photosAccueil`, `equipes`, `articles`, `partenaires`) avec des libellés
  en français, et restreint volontairement certains champs pour un public
  non technique :
  - `equipes` : création/suppression désactivées (l'effectif de la saison
    est fixé) ; les champs `slug` et `ordre` sont en `widget: hidden` (non
    éditables depuis l'interface, car les changer casserait des liens ou le
    tri) ; `type` est un menu déroulant fermé (pas de texte libre).
  - `articles`/`partenaires`/`photosAccueil` : création/suppression
    activées ; le champ `slug` des articles reste un texte libre (nécessaire
    pour l'URL d'un nouvel article) mais validé par un motif
    (minuscules/chiffres/tirets uniquement) et accompagné d'un
    avertissement.
  - Toutes les collections partagent le même dossier média (`src/assets`,
    en chemin relatif `../../assets` pour rester compatible avec le schéma
    `image()` d'Astro) : une photo uploadée une fois est réutilisable depuis
    n'importe quel champ image de n'importe quelle collection. Ce chemin
    relatif doit être déclaré sur **chaque champ image pris individuellement**
    (y compris ceux imbriqués dans un widget `list`, comme `galerie`) : le
    réglage au niveau de la collection ne se propage pas automatiquement aux
    champs imbriqués (constaté en test — un champ `list > image` sans son
    propre `media_folder` récupère le dossier média global et écrit un
    chemin absolu du style `/src/assets/x.jpg`, incompatible avec le schéma
    `image()` d'Astro qui attend un chemin relatif au fichier `.md`).
  - **Le flux de calendrier FFHandball n'est pas dans ce CMS** : il vit dans
    `src/data/agenda-teams.config.ts` (fichier TypeScript, pas une content
    collection), avec une relation un-flux-vers-plusieurs-équipes (ex :
    Seniors masculins 1 et 2). L'y exposer aurait demandé de restructurer
    cette donnée, hors périmètre de cette tâche — ça reste une modification
    de développeur (voir la section Agenda ci-dessus).
- **Authentification** : GitHub natif. Comme le site est hébergé sur GitHub
  Pages (pas de fonction serveur), l'échange OAuth passe par un petit relais
  externe (voir `backend.base_url` dans `config.yml`) — le Cloudflare Worker
  [sveltia-cms-auth](https://github.com/sveltia/sveltia-cms-auth), déployé
  en CLI (`wrangler deploy`, pas depuis ce dépôt) avec les secrets
  `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` de l'OAuth App GitHub du club et
  `ALLOWED_DOMAINS` restreint au domaine du site. Seuls les collaborateurs
  du dépôt GitHub peuvent se connecter ; pour en ajouter un, voir la fin de
  `GUIDE-EDITION.md`.
- **Publication directe, pas de workflow éditorial** : volontairement
  désactivé (`publish_mode` absent = comportement par défaut) tant que seules
  les deux administratrices ont accès au CMS — la relecture avant
  publication n'apportait rien dans cette configuration. Pour la réactiver
  (accès élargi à des bénévoles non techniques), ajouter dans
  `public/admin/config.yml`, juste avant `site_url` :
  ```yaml
  publish_mode: editorial_workflow
  ```
- **Tester en local** sans configurer l'authentification : lancez
  `npm run dev`, ouvrez `/admin/index.html`, cliquez sur **« Travailler avec
  un dépôt local »** et choisissez le dossier racine du projet. Les
  modifications s'écrivent alors directement dans les fichiers locaux (à
  committer vous-même avec Git) — pratique pour vérifier un champ sans
  toucher au dépôt distant.
