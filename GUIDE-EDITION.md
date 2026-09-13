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

Vous ne pouvez ni ajouter ni supprimer une équipe depuis cette interface :
la liste des équipes est fixée pour la saison. Pour un vrai changement
d'effectif, contactez la personne qui s'occupe du site.

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
contactez la personne qui gère le site techniquement pour vérifier.

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
