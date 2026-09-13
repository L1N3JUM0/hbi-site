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
  `src/content/photos-accueil/`, `src/content/histoire-club/` — content
  collections Astro (un fichier par équipe/article/partenaire/photo/moment)
- `src/content/le-club/page.md` — page unique (histoire, parrain, infos
  pratiques), même principe mais un seul fichier
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

## Le club (page unique)

La page `/le-club` (histoire, devise, parrain, infos pratiques) est éditable
depuis Sveltia CMS ("Page « Le club »") sans toucher au code. Contrairement
aux autres collections, c'est un **seul fichier** —
**`src/content/le-club/page.md`** — configuré côté CMS comme une collection
"fichier" (`files:`, pas `folder:`) : pas de création ni de suppression
possible, uniquement une édition de ses champs. Les textes longs
(`histoireIntro`, `histoireConclusion`, `parrainTexte`) sont de simples
chaînes multi-paragraphes : une ligne vide sépare deux paragraphes,
affichés comme des `<p>` distincts par `le-club.astro`.

### Moments marquants & figures du club

**`src/content/histoire-club/`** est une collection classique (un fichier
par entrée), **vide au départ**, prête à accueillir l'histoire du club par
étapes : un tournoi mémorable, une personne qui a compté, une saison
marquante... Champs : `titre`, `periode` (texte libre : "1977", "Saison
2010-2011"...), `texte`, `photo` (optionnelle) et `ordre`. Affichée sur
`/le-club` entre la section parrain et les infos pratiques, uniquement si
au moins une entrée existe (sinon la section n'apparaît pas du tout — pas
de bloc vide sur le site). Éditable depuis Sveltia CMS ("Moments marquants
& figures du club"), création/suppression libres.

Tant que le dossier est vide, `astro build` affiche deux avertissements
bénins (`No files found matching "*.md"...` et `The collection
"histoireClub" does not exist or is empty...`) : c'est le comportement
normal du loader de content collection d'Astro pour une collection vide par
design, ça ne casse rien, et les deux disparaissent dès la première entrée
ajoutée. Un fichier `.gitkeep` maintient le dossier `histoire-club/`
présent dans le dépôt (Git ne suit pas les dossiers vides) : sans lui, le
premier avertissement serait plus alarmant (`does not exist` plutôt que
`no files found`) sur un environnement fraîchement cloné (CI, autre poste).

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
- **`public/admin/config.yml`** définit les 6 collections éditables
  (`leClub`, `histoireClub`, `photosAccueil`, `equipes`, `articles`,
  `partenaires`) avec des libellés en français, et restreint volontairement
  certains champs pour un public non technique :
  - `equipes` : création/suppression désactivées (l'effectif de la saison
    est fixé) ; les champs `slug` et `ordre` sont en `widget: hidden` (non
    éditables depuis l'interface, car les changer casserait des liens ou le
    tri) ; `type` est un menu déroulant fermé (pas de texte libre).
  - `leClub` : collection "fichier" (`files:`), pas de création/suppression
    possible — un seul enregistrement, un seul fichier.
  - `articles`/`partenaires`/`photosAccueil`/`histoireClub` :
    création/suppression activées ; le champ `slug` des articles reste un
    texte libre (nécessaire pour l'URL d'un nouvel article) mais validé par
    un motif (minuscules/chiffres/tirets uniquement) et accompagné d'un
    avertissement.
  - **Un seul dossier média pour tout le CMS** : `media_folder`/
    `public_folder` ne sont déclarés qu'une fois, en haut de `config.yml`
    (`src/assets` / `/src/assets`), et nulle part ailleurs. Une première
    version déclarait aussi ces deux clés sur chaque collection et chaque
    champ image (en chemin relatif `../../assets`, pour correspondre au
    format attendu par le schéma `image()` d'Astro) : ça pointait déjà vers
    le même dossier physique sur disque, mais Sveltia CMS traite chaque
    déclaration de `media_folder` comme une bibliothèque de médias
    distincte dans son interface -- une photo envoyée depuis le champ d'une
    collection n'apparaissait alors pas dans le sélecteur d'une autre,
    malgré l'intention de médiathèque partagée. Une seule déclaration,
    globale, résout ça : toute photo envoyée depuis n'importe quel champ
    est proposée dans le sélecteur de n'importe quel autre champ. Ça
    reproduit aussi, systématiquement, le format `/src/assets/x.jpg`
    (chemin absolu depuis la racine du projet) plutôt que le chemin relatif
    `../../assets/x.jpg` -- les deux fonctionnent avec le schéma `image()`
    d'Astro (voir plus bas), donc sans conséquence.
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

### Robustesse face aux chemins d'image écrits par le CMS

Le 13/09/2026, un chemin d'image écrit sans aucun préfixe par le CMS
(`src/assets/x.png` au lieu de `../../assets/x.png`) a fait planter
**tout le build en production** (erreur `[ImageNotFound]` d'Astro), pas
seulement la page concernée. Deux filets de sécurité corrigent ça
durablement, à deux niveaux :

1. **`src/content.config.ts`** : chaque champ image de chaque collection
   passe par `safeImage(image)` plutôt que `image()` seul.
   `normalizeImagePath()` corrige automatiquement un chemin "nu" (sans `./`,
   `/` ni protocole) en le préfixant de `../../assets/` avant de le confier
   au schéma `image()` d'Astro — peu importe le format exact écrit par le
   CMS, tant que le fichier existe réellement dans `src/assets/`, le build
   ne casse plus pour ça. Les chemins déjà valides (relatifs, commençant par
   `/`, ou des URLs) ne sont pas modifiés.
2. **`scripts/check-content-images.mjs`** (lancé automatiquement avant
   chaque build via le script npm `prebuild`) : vérifie que chaque image
   référencée dans `src/content/` correspond à un fichier qui existe
   vraiment dans `src/assets/`. Si une référence est cassée (mauvais nom de
   fichier, faute de frappe...), le build échoue **avant** même de lancer
   Astro, avec un message clair listant tous les problèmes d'un coup — au
   lieu de la stack trace peu explicite d'Astro sur la première erreur
   rencontrée. Peut aussi être lancé seul :
   `node scripts/check-content-images.mjs`.

Ces deux filets ne remplacent pas une image réellement manquante (un nom de
fichier qui n'existe nulle part fera toujours échouer le build, à raison —
impossible d'afficher une image qui n'existe pas) ; ils éliminent la classe
de bug observée (un format de chemin inhabituel pour un fichier qui, lui,
existe bel et bien).

### Optimisation automatique des images à l'envoi

`media_libraries.all` dans `config.yml` fait tourner, côté navigateur, une
compression/conversion automatique **à chaque nouvel envoi** (les fichiers
déjà dans le dépôt ne sont jamais retouchés) :

- `transformations.raster_image` : conversion en WebP, réduite si besoin à
  2048 px de large/haut maximum (jamais agrandie si l'original est plus
  petit). Cette valeur couvre largement le plus grand affichage réel du
  site (couverture d'article demandée à 1200 px à Astro — voir les appels à
  `<Image width={...} />` dans `src/`), avec de la marge pour les écrans
  Retina/haute densité.
- `transformations.svg.optimize` : minification des SVG (utile pour les
  logos de partenaires).
- `max_file_size: 5000000` (5 Mo) : vérifié **après** transformation (donc
  sur le fichier déjà compressé, confirmé en lisant le code de Sveltia CMS
  -- la fonction qui applique `transformations` s'exécute avant celle qui
  compare `file.size` à cette limite) — un simple garde-fou contre un
  fichier anormal, pas un budget serré à l'usage normal.
- `slugify_filename: true` : assainit le nom de fichier à l'envoi (accents,
  espaces, majuscules, parenthèses...), pour éviter tout souci de chemin
  selon l'hébergement.

Un fichier `.webp` comme source d'un champ `image()` d'Astro fonctionne
sans rien à changer côté schéma ou composants (déjà le cas en production :
`src/assets/Pays_d'Aix_Université_Club_Handball_2017_logo.svg.webp`, le
logo d'un partenaire, est une vraie source WebP qui build normalement).
