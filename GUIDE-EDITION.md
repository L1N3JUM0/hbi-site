# Guide d'édition du site (pour les bénévoles)

Ce guide explique comment modifier le contenu du site du HBI sans toucher au
code, via l'interface d'administration.

## Se connecter

1. Allez sur **`https://l1n3jum0.github.io/hbi-site/admin/`**.
2. Cliquez sur **« Se connecter avec GitHub »**.
3. Autorisez l'application si GitHub vous le demande. Vous arrivez sur le
   tableau de bord, avec ces rubriques à gauche : **Page « Le club »**,
   **Moments marquants & figures du club**, **Photos de la page d'accueil**,
   **Équipes**, **Vie du club** et **Partenaires**.

> Seules les personnes ajoutées comme collaborateurs du dépôt GitHub peuvent
> se connecter (voir "Donner accès à une nouvelle personne" en bas de page).

## Une seule médiathèque pour toutes les photos

Toutes les photos, quel que soit l'endroit où vous les avez ajoutées
(équipe, article, partenaire...), atterrissent dans la **même bibliothèque
partagée**. Quand vous cliquez sur un champ photo, vous pouvez donc soit en
glisser-déposer une nouvelle, soit en choisir une déjà présente — même si
elle a été ajoutée depuis une autre rubrique. Pas besoin de retéléverser
deux fois la même image.

**Pas besoin de préparer vos photos avant de les envoyer.** Une affiche
Canva, une photo prise avec le téléphone (même plusieurs Mo) : le site les
compresse et les redimensionne automatiquement dès l'envoi. Vous n'avez
rien à faire de particulier de votre côté.

**Renommer une photo déjà envoyée.** Si le nom d'un fichier n'est pas très
parlant (ex. `IMG_2481.jpg`), ouvrez la **Bibliothèque de médias**, cliquez
sur la photo puis renommez-la : partout où elle est déjà utilisée sur le
site se met à jour automatiquement avec le nouveau nom, rien ne se casse.

## Ajouter/retirer une photo du carrousel de la page d'accueil

1. Cliquez sur **Photos de la page d'accueil**.
2. Pour en ajouter une : **Nouvelle photo**, glissez-déposez l'image,
   décrivez-la brièvement (champ **« Description de la photo »**, utile pour
   les personnes malvoyantes), et donnez-lui un **« Ordre d'affichage »**
   (1 = en premier).
3. Pour en retirer une : ouvrez-la et utilisez la corbeille en haut de la
   page.
4. **Enregistrer** : le changement part directement en ligne (voir
   "Publication" ci-dessous).

## Modifier la page « Le club »

1. Cliquez sur **Page « Le club »** puis **Contenu de la page « Le club »**.
2. Modifiez l'histoire, la citation, la présentation du parrain (texte et
   photo) ou les infos pratiques (adresse, téléphone, e-mail, réseaux).
   Pour un texte en plusieurs paragraphes, laissez une ligne complètement
   vide entre deux paragraphes.
3. **Enregistrer** : le changement part directement en ligne.

Vous ne pouvez pas créer ou supprimer cette page : c'est une page unique.

## Ajouter un moment marquant ou une figure du club

1. Cliquez sur **Moments marquants & figures du club** puis **Nouveau**.
2. Renseignez un titre, une période (une date ou une saison, au choix
   libre), un texte, et une photo si vous en avez une (facultatif — toute
   photo, même verticale ou carrée, s'affichera entière, sans être coupée).
3. Donnez-lui un **« Ordre d'affichage »** (1 = en premier) pour choisir où
   il apparaît par rapport aux autres.
4. **Enregistrer** : il apparaît sur `/le-club`, sous la section du parrain.

Tant qu'aucun moment n'a été ajouté, cette section n'apparaît pas du tout
sur le site — rien à faire de particulier pour ça.

## Modifier une équipe

1. Cliquez sur **Équipes**, puis sur l'équipe à modifier.
2. Changez le texte souhaité (horaires, encadrants, tarif, description...).
3. Pour changer la photo : cliquez sur l'image existante puis sur
   **Choisir un fichier** (ou glissez-déposez une nouvelle photo dessus).
   - **« Photo de l'équipe »** = la photo affichée sur la page d'accueil et
     en haut de la page de l'équipe.
   - **« Galerie de photos »** = les photos qui défilent sur la page
     Équipes ; utilisez le **+** pour en ajouter une, la poubelle pour en
     retirer une.
4. Cliquez sur **Enregistrer** en haut à droite : le changement part
   directement en ligne (voir "Publication" ci-dessous).

## Créer une nouvelle équipe

Une nouvelle catégorie (ex. une U16 qui n'existait pas avant) se crée
directement depuis `/admin`, sans intervention technique.

1. Cliquez sur **Équipes** puis **Nouvelle équipe**.
2. Remplissez au minimum :
   - **Nom de l'équipe** (ex. « U16 masculins »).
   - **Catégorie** : choisissez « Équipe de compétition », sauf s'il s'agit
     d'un créneau découverte/inclusion/transversal.
   - **Identifiant technique** : une version courte du nom, en minuscules et
     avec des tirets, sans espace ni accent (ex. « u16-masculins »). Choisissez-le
     soigneusement : ne le modifiez plus une fois l'équipe créée, il relie les
     résultats de match à cette équipe.
   - **Ordre d'affichage** : un nombre qui détermine sa place dans la liste
     (regardez les nombres déjà utilisés par les autres équipes de la même
     catégorie, et choisissez-en un libre).
   - **Catégorie d'âge** et **Genre** : voir "Rattacher automatiquement les
     feuilles de match à une nouvelle équipe" ci-dessous — important, sans
     ça les feuilles de match de cette équipe ne se rattacheront pas toutes
     seules.
   - Horaires, encadrant(s), tarif, description, photo(s) : comme pour une
     équipe existante.
3. **Enregistrer**.

### Rattacher automatiquement les feuilles de match à une nouvelle équipe

Si la nouvelle équipe joue un championnat classé par âge (ce qui est le cas
de la quasi-totalité des équipes du club), remplissez ces deux champs :

- **Catégorie d'âge** : exactement comme elle apparaît dans le nom de la
  compétition sur les feuilles de match FFHandball (ex. `U13`, `U17`), ou
  `senior` pour les seniors.
- **Genre** : Mixte, Féminin ou Masculin.

Avec ces deux informations, le site reconnaît automatiquement à quelle
équipe rattacher une feuille de match déposée dans « Feuilles de match » —
comme pour n'importe quelle équipe existante, sans rien coder. Laissez ces
deux champs vides pour un créneau qui ne joue pas ce type de championnat
(Loisirs, Découverte, Handensemble, créneau transversal) : ses résultats,
s'il y en a, devront être saisis à la main (voir « Ajouter le résultat d'un
match » plus bas).

**Si une feuille de match déposée ne se rattache à aucune équipe** (parce
que la « Catégorie d'âge »/le « Genre » n'ont pas été remplis, ou ne
correspondent pas exactement au texte de la compétition), un bandeau
d'avertissement apparaît en haut de `/equipes` pour le signaler clairement,
avec le nom du fichier concerné : jamais d'échec silencieux. Il suffit alors
de corriger la fiche équipe, ou de choisir l'équipe à la main dans la
rubrique **Résultats** du CMS.

## Archiver une équipe qui s'arrête

Une équipe ne se supprime **jamais** depuis `/admin` (le bouton n'existe pas,
volontairement) : une équipe dissoute ou dont la catégorie n'est pas
reconduite s'**archive** à la place, pour que ses résultats passés restent
consultables sur le site.

1. Cliquez sur **Équipes**, puis sur l'équipe concernée.
2. Passez le champ **Statut** de « Active » à « Archivée ».
3. **Enregistrer**.

L'équipe disparaît alors de la liste principale de `/equipes` (plus
d'horaires, d'encadrants ni de tarif affichés — ça n'a plus de sens pour une
équipe qui ne joue plus), mais reste visible tout en bas de la page, dans une
section repliée **« Équipes des saisons passées »**, avec ses résultats
toujours accessibles. Elle disparaît aussi des calendriers/de l'agenda et de
la page d'inscription (`/rejoindre`).

**Ne remettez jamais à zéro les champs horaires/encadrants/tarif** d'une
équipe archivée : ils ne s'affichent plus nulle part, inutile de les vider.

## Ajouter ou changer le calendrier d'une équipe

Chaque saison, la fédération publie de nouveaux calendriers (nouvelles
adresses de flux), catégorie par catégorie, au fil de l'automne. Mettre à
jour cette adresse se fait entièrement depuis `/admin`, sans intervention
technique.

1. Cliquez sur **Équipes**, puis sur l'équipe concernée.
2. Repérez le champ **« Calendriers de compétition »**.
3. Sur le site de la FFHandball, ouvrez la page de la compétition de cette
   équipe, puis cliquez sur le bouton **« Ajouter les matchs à votre
   calendrier »** : il propose un lien qui se termine par `.ics`. Copiez ce
   lien.
4. Dans le champ **« Lien du calendrier (.ics) »**, collez ce lien
   (créez une entrée avec le **+** si l'équipe n'en avait pas encore).
   Laissez **« Repère de cette équipe dans le flux »** à sa valeur par
   défaut (« Handball Islois »).
5. **Enregistrer**. Le nouveau calendrier apparaît sur `/agenda` et sur la
   fiche de l'équipe dans les minutes qui suivent (le site se reconstruit
   automatiquement).

**Cas particulier : deux équipes du club dans la même poule** (ex. Seniors
masculins 1 et 2). Créez alors une entrée de calendrier par équipe, avec le
**même lien .ics**, mais un **« Repère de cette équipe dans le flux »**
différent pour chacune (le texte exact qui les distingue sur ffhandball.fr,
ex. « Handball Islois 1 » / « Handball Islois 2 ») et un **« Numéro »**
(1, 2...) pour les distinguer sur l'agenda du site.

**Le calendrier de la saison n'est pas encore publié par la fédération ?**
Laissez le champ vide, ou laissez l'ancienne adresse si elle fonctionne
encore : une équipe sans calendrier valide n'apparaît simplement pas dans
l'agenda, sans erreur ni bloc vide sur le site. Revenez compléter le champ
dès que la fédération publie le nouveau calendrier (voir "Changement de
saison" ci-dessous).

## Ajouter le résultat d'un match

Après un match, la feuille de match officielle (score, chronologie,
statistiques des joueur·se·s) est publiée par la fédération quelques
heures après la rencontre. Le site peut la récupérer automatiquement :
vous n'avez qu'à déposer le PDF, tout le reste (résultat, graphique
d'évolution du score, statistiques) est ajouté seul.

### 1. Récupérer le PDF sur le site de la FFHandball

1. Sur le site de la FFHandball (celui utilisé pour le calendrier et le
   classement — pour les équipes concernées, accessible depuis le bouton
   « Voir le classement » sur `/agenda`), ouvrez la page de la rencontre du
   HBI qui vient de se jouer.
2. Téléchargez la **feuille de match (PDF)** de cette rencontre — le bouton
   s'appelle en général « Feuille de match » ou une icône PDF à côté du
   score.
3. Enregistrez le fichier sur votre ordinateur ou votre téléphone (son nom
   n'a pas d'importance, ex. `VAGEXGV.pdf`).

### 2. Le déposer sur le site

1. Connectez-vous sur `/admin` (voir "Se connecter" en haut de ce guide) et
   cliquez sur **Feuilles de match**.
2. Cliquez sur **Nouvelle feuille de match**, puis glissez-déposez le PDF
   téléchargé à l'étape précédente dans le champ **« Feuille de match
   (PDF) »**.
3. **Enregistrer**. C'est tout : pas de score à recopier, pas d'équipe à
   choisir, le site s'en charge.

### 3. Le résultat apparaît sur le site

Le dépôt du PDF déclenche une reconstruction automatique du site, comme
pour n'importe quel autre changement (voir "Publication" plus bas) —
**comptez quelques minutes**. Une fois terminé, le match apparaît dans le
bloc **Résultats** (replié par défaut, à dérouler) de la fiche de l'équipe
concernée sur `/equipes`, avec le graphique d'évolution du score, les
statistiques d'équipe et les meilleur·e·s buteur·se·s.

Si le match n'apparaît toujours pas après une dizaine de minutes, il est
possible que le PDF n'ait pas pu être lu automatiquement (feuille
scannée au lieu d'un export du site FFHandball, format inhabituel...) :
un bandeau apparaît alors en haut de `/equipes` pour le signaler
clairement, avec le nom du fichier concerné.

**Seuls les matchs de la saison en cours (septembre à juin) apparaissent
dans le bloc Résultats.** C'est volontaire : l'effectif d'une équipe change
d'une saison à l'autre, un ancien résultat n'a plus le même sens. Les
saisons précédentes ne sont pas perdues : elles restent consultables juste
en dessous, dans un second bloc replié **« Saisons précédentes »**.

**En secours**, si vous n'avez pas pu récupérer la feuille de match, vous
pouvez saisir un résultat à la main : rubrique **Résultats** → **Nouveau
résultat**, en renseignant l'équipe, la date, l'adversaire et le score
(pas de graphique ni de statistiques détaillées dans ce cas, faute de
feuille de match à analyser).

*Note technique (pour la personne qui gère le site) : les statistiques
individuelles des joueur·se·s sont affichées en nominatif ou pseudonymisées
selon l'équipe (champ `affichageStats` dans `src/content/equipes/`,
volontairement absent de l'interface `/admin` vu l'enjeu de confidentialité
pour les catégories jeunes) — voir CLAUDE.md et le code pour le détail des
règles.*

## Changement de saison

La saison de handball va de septembre à juin. Chaque année, entre la fin
d'une saison et la rentrée de septembre, quelques gestes sont à faire côté
site. Rien de tout ça n'est urgent le jour même : les calendriers sortent
progressivement au fil de l'automne, catégorie par catégorie, et le site
reste propre entre-temps (voir "Pendant l'été" plus bas).

### Ce qui se met à jour tout seul, sans rien faire

- **Les résultats de la saison écoulée passent en archive automatiquement.**
  Dès le 1er juillet, le bloc « Résultats » de chaque équipe sur `/equipes`
  bascule tout seul dans « Saisons précédentes ». Rien à faire.
- **Le sous-titre de la page Équipes** (« ... pour la saison XXXX-XXXX »)
  se met aussi à jour tout seul au 1er juillet.
- **Une équipe qui n'a pas changé** (même catégorie, mêmes horaires) n'a
  besoin d'aucune intervention avant la reprise.

### Ce qu'il faut faire, dans l'ordre

1. **Vérifier les horaires, encadrant(s) et tarifs de chaque équipe** dès
   qu'ils sont connus pour la nouvelle saison (voir "Modifier une équipe").
   Rien de particulier : les champs restent les mêmes d'une saison à
   l'autre.

2. **Créer une fiche pour chaque nouvelle catégorie** (ex. une U16 qui
   n'existait pas la saison précédente) — voir "Créer une nouvelle équipe"
   ci-dessus. Pensez à bien renseigner **Catégorie d'âge** et **Genre** pour
   que les feuilles de match de cette nouvelle équipe se rattachent toutes
   seules dès la première déposée.

3. **Archiver les équipes qui s'arrêtent** (catégorie non reconduite,
   équipe dissoute...) — voir "Archiver une équipe qui s'arrête" ci-dessus.
   Ne les supprimez jamais.

4. **Une catégorie qui change de forme** (ex. un U13 mixte qui devient deux
   équipes, U13 féminines et U13 masculins — déjà vu au club) se traite comme
   une combinaison des deux gestes précédents : archivez l'ancienne fiche
   « U13 mixtes », et créez deux nouvelles fiches « U13 féminines » et « U13
   masculins » avec leurs propres identifiants techniques. Les résultats
   déjà enregistrés sous l'ancienne équipe restent attachés à elle et
   consultables dans ses archives ; seuls les résultats à partir de la
   nouvelle saison iront sur les nouvelles fiches.

5. **Mettre à jour le calendrier de chaque équipe dès qu'il est publié par
   la fédération** — voir "Ajouter ou changer le calendrier d'une équipe"
   ci-dessus. Les calendriers sortent catégorie par catégorie au fil de
   l'automne : pas besoin d'attendre que tous soient prêts, mettez à jour au
   fur et à mesure. Tant qu'une équipe n'a pas encore son nouveau calendrier,
   elle n'apparaît simplement pas dans l'agenda (ou garde l'ancien s'il
   fonctionne encore) — jamais d'erreur ni de bloc vide.

### Pendant l'été (aucun match, calendriers pas encore publiés)

Le site n'a besoin d'aucune intervention pendant la trêve : sans match à
venir, `/agenda` affiche simplement « Aucun match à venir pour le moment »
et le bandeau de la page d'accueil (« Prochaine journée ») ne s'affiche pas
du tout. Aucun message d'erreur, aucun bloc vide disgracieux. Vous pouvez
donc traiter les points ci-dessus à votre rythme au fil de l'été et de
l'automne.

### Ce qui reste technique (à transmettre à la personne qui gère le site)

Tout le changement de saison se fait maintenant depuis `/admin`. Un seul cas
reste hors de portée du CMS et demande de contacter la personne qui gère le
site techniquement :

- **Un texte figé dans le code** qui citerait une saison ou une catégorie en
  dur ailleurs que dans les fiches équipes (rare : à ce jour, tout le texte
  visible du site dépend soit du contenu du CMS, soit est calculé
  automatiquement depuis la date).

## Publier un article dans « Vie du club »

1. Cliquez sur **Vie du club**, puis sur **Nouvel article** (ou un article
   existant pour le modifier).
2. Remplissez le titre, la date, la photo de couverture et un court
   extrait.
3. Écrivez le texte de l'article dans le champ **Contenu**. Vous pouvez
   ajouter des photos dans le texte avec le bouton image de la barre
   d'outils.
4. Dans **« Identifiant technique de l'adresse »**, choisissez un texte
   court en minuscules avec des tirets (ex : `tournoi-de-noel`). Ne le
   modifiez plus une fois l'article publié et partagé.
5. **Enregistrer** : le changement part directement en ligne (voir
   "Publication" ci-dessous).

## Ajouter un partenaire

1. Cliquez sur **Partenaires** puis **Nouveau partenaire**.
2. Renseignez le nom, le logo et le site web du partenaire.
3. **Enregistrer** : le changement part directement en ligne (voir
   "Publication" ci-dessous).

## Publication

Cliquer sur **Enregistrer** publie directement le changement sur le site en
ligne (quelques minutes pour que le site se reconstruise) — il n'y a pas
d'étape de relecture intermédiaire. C'est un choix assumé tant que seules
les deux administratrices ont accès au CMS ; réfléchissez avant de cliquer.

*Note technique (pour la personne qui gère le site) : si l'accès au CMS est
un jour élargi à des bénévoles non techniques, réactiver la relecture avant
publication en ajoutant `publish_mode: editorial_workflow` dans
`public/admin/config.yml` (juste avant `site_url`).*

## Donner accès à une nouvelle personne

L'accès à `/admin` passe par un compte GitHub ajouté comme collaborateur du
dépôt. Pour en ajouter un :

1. Allez sur `https://github.com/L1N3JUM0/hbi-site/settings/access`.
2. Cliquez sur **Add people**.
3. Entrez le nom d'utilisateur GitHub (ou l'e-mail) de la personne, puis
   validez l'invitation.
4. La personne doit accepter l'invitation reçue par e-mail/notification
   GitHub. Une fois acceptée, elle peut se connecter sur `/admin` avec son
   compte GitHub.

Pour retirer l'accès à quelqu'un, même page, à côté de son nom → **Remove**.
