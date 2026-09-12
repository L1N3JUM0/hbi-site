# Guide d'édition du site (pour les bénévoles)

Ce guide explique comment modifier le contenu du site du HBI sans toucher au
code, via l'interface d'administration.

## Se connecter

1. Allez sur **`https://l1n3jum0.github.io/hbi-site/admin/`**.
2. Cliquez sur **« Se connecter avec GitHub »**.
3. Autorisez l'application si GitHub vous le demande. Vous arrivez sur le
   tableau de bord, avec trois rubriques à gauche : **Équipes**,
   **Vie du club** et **Partenaires**.

> Seules les personnes ajoutées comme collaborateurs du dépôt GitHub peuvent
> se connecter (voir "Donner accès à une nouvelle personne" en bas de page).

## Ajouter/retirer une photo du carrousel de la page d'accueil

1. Cliquez sur **Photos de la page d'accueil**.
2. Pour en ajouter une : **Nouvelle photo**, glissez-déposez l'image,
   décrivez-la brièvement (champ **« Description de la photo »**, utile pour
   les personnes malvoyantes), et donnez-lui un **« Ordre d'affichage »**
   (1 = en premier).
3. Pour en retirer une : ouvrez-la et utilisez la corbeille en haut de la
   page.
4. **Enregistrer**, puis **Publier**.

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
4. Cliquez sur **Enregistrer** en haut à droite, puis sur **Publier** une
   fois que vous êtes sûr(e) de vous (voir "Validation" ci-dessous).

Vous ne pouvez ni ajouter ni supprimer une équipe depuis cette interface :
la liste des équipes est fixée pour la saison. Pour un vrai changement
d'effectif, contactez la personne qui s'occupe du site.

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
5. **Enregistrer**, puis **Publier**.

## Ajouter un partenaire

1. Cliquez sur **Partenaires** puis **Nouveau partenaire**.
2. Renseignez le nom, le logo et le site web du partenaire.
3. **Enregistrer**, puis **Publier**.

## Validation avant publication

Chaque modification passe par une étape de relecture avant d'apparaître sur
le site en ligne : après avoir cliqué sur **Enregistrer**, la modification
part dans un espace « en attente ». Un des deux administrateurs doit encore
cliquer sur **Publier** (visible dans le menu **Éditorial** en haut) pour
qu'elle devienne visible sur le vrai site. Cela évite qu'une modification
publiée par erreur (par l'une ou l'autre des deux personnes) parte
directement en ligne.

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
