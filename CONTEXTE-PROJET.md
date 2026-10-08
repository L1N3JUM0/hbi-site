# Contexte du projet HBI — à lire avant toute nouvelle session

*Document de synthèse, pas un journal chronologique. Objectif : que n'importe quelle
nouvelle conversation (chat ou Claude Code) reparte avec les bonnes décisions, sans
refaire les erreurs déjà commises.*

**Où le placer** : à la racine du dépôt. Ajoute une ligne dans `CLAUDE.md` qui y
renvoie ("Lis aussi CONTEXTE-PROJET.md avant de commencer"), pour que Claude Code le
charge systématiquement.

---

## 1. Le projet en une phrase

Site vitrine + back-office pour le Handball Islois (HBI), statique (Astro), déployé
sur GitHub Pages, édité via Sveltia CMS. Contenu géré par les bénévoles du club sans
compétence technique. Toutes les décisions techniques sont subordonnées à cette
contrainte : si un bénévole ne peut pas le faire seul, ce n'est pas fini.

---

## 2. Identité et faits du club (à ne jamais réinventer)

- Fondé le 8 novembre 1977 par Jean Guillen. Présidente actuelle : Sonia Saux.
- Devise : « Je ne perds jamais : soit je gagne, soit j'apprends. »
- Lieu d'entraînement officiel unique : **COSEC Émile Avy**, Avenue Jean Bouin, 84800
  L'Isle-sur-la-Sorgue. Le Gymnase Jean Garcin n'apparaît **jamais** comme lieu du
  club — c'est un accord ponctuel inter-clubs, pas un lieu officiel.
- Réseaux confirmés : Facebook facebook.com/handballislois84, Instagram
  instagram.com/handball.islois (avec un point, pas un tiret bas).
- Parrain du club : Hugo Brouzet, pivot professionnel au PAUC (LNH Division 1).
- Palette officielle, extraite du vrai logo (jamais inventée) :
  `#0259AA` (bleu), `#012891` / `#001749` (marine), `#BB034D` (fuchsia/crimson).
- Deux équipes numérotées la même saison : Seniors masculins (1/2), U15 masculins
  (Interdépartemental / Région Excellence, distingués par libellé texte, pas par
  numéro). Une entente HBI/Le Thor existe en U17F, nommée "L'ISLE - LE THOR (U17F)"
  dans les données fédérales — aucune occurrence de "Handball" ni "Islois".
- Catégories qui n'existent plus sous leur forme actuelle : U13 mixte (scindé en
  U13F/U13M) et U17 masculins (jamais reconduit) → équipes archivées dédiées
  (`u13-mixte-historique`, `u17-masculins-historique`), jamais rattachées de force à
  une équipe actuelle qui ne correspond pas à la même réalité sportive.

---

## 3. Architecture technique

- **Astro statique**, contenu en content collections Markdown/YAML, Sveltia CMS pour
  l'édition, déploiement GitHub Pages via GitHub Actions.
- **Aucun appel réseau côté navigateur du visiteur** : tout ce qui vient de sources
  externes (calendriers FFHandball, feuilles de match, futur JSON de vérification)
  est récupéré **au build**, jamais depuis le poste du visiteur. Zéro cookie tiers.
- **Reconstruction automatique** : quotidienne (6h) + week-end (samedi 23h, dimanche
  22h) pour que les résultats du week-end apparaissent le soir même.
- **Authentification CMS** : GitHub OAuth, deux personnes seulement pour l'instant
  (décision explicite, pas une limite technique — le workflow éditorial de
  validation a été désactivé en conséquence).

---

## 4. Les trois formats de feuille de match FFHandball

Il n'existe que **trois formats connus**, pas un par saison :

- **Format A ("ancien")** : au moins 2021 à 2023. Pièges : le nombre de colonnes du
  bloc "Détail score" varie et des colonnes vides se trouvent EN MILIEU de ligne (lire
  par en-tête, jamais par position — vérifier que "Fin Tps Reglem." égale le score
  affiché) ; le club recevant n'est pas toujours à domicile (terrain neutre, champ
  "Club Hôte" séparé) ; nom d'usage suffixé " - NOM" avec espaces (à ne pas confondre
  avec un nom composé à double tiret SANS espaces, ex. "DUPONT--MARTIN" (exemple fictif), à garder
  intact) ; prénoms en minuscules à recapitaliser ; déroulé préfixé JR/JV.
- **Format B** : saison 2025-2026.
- **Format C (nouvelle FDME)** : saison 2026-2027, déroulé sur deux colonnes par page
  (trier par horodatage, ne pas lire ligne à ligne).
- **2019-2020 non supporté** : date/heure sur deux lignes, en-têtes différents
  ("Di." au lieu de "Dis", "prénom épouse Nom d'usage"). Mis de côté volontairement
  (peu de joueurs actuels concernés, faible priorité).

**Extraction des stats joueurs** : positionnelle par colonnes (indices déduits de la
ligne d'en-tête), une regex classique échoue sur ce tableau.

---

## 5. Récupération des données FFHandball — ce qui marche, ce qui ne marche pas

- Le paramètre `s-3577` dans les URL de flux iCal est l'**identifiant de structure du
  club**, pas la saison — un flux `c-XXXX/s-3577.ics` ne contient déjà que les
  matchs du HBI. Si le nom d'équipe est vide ou incohérent, on peut quand même faire
  confiance à la totalité du flux (sauf configuration à équipes multiples, où le nom
  reste nécessaire pour distinguer).
- Les PDF de feuilles de match sont servis par `fdm.fdme.ffhandball.fr` et restent
  accessibles **indépendamment** de la page de compétition, même quand celle-ci est
  purgée. Le vrai verrou est la **découverte des codes de rencontre**, pas l'accès au
  PDF lui-même.
- **Chemin fiable pour retrouver l'historique d'une saison** : site FFHandball →
  Compétitions → saison choisie → Départementaux/Régionaux → trouver la compétition →
  cliquer sur l'équipe HBI → page équipe listant tous ses matchs. Pas d'API de
  recherche, pas d'index par club — seulement ce cheminement manuel, qu'on peut
  automatiser une fois qu'on connaît l'identifiant de compétition par saison.
- Débit limité (429) côté serveur fédéral : toujours télécharger par petits lots
  espacés, jamais en rafale.
- L'application mobile FFHandball affiche des stats joueurs cumulées (JSON injecté
  dans le HTML, lisible sans navigateur piloté), mais **sans numéro de licence** —
  inutilisable comme source du cumul de carrière, seulement comme outil de
  vérification en arrière-plan (jamais la source d'affichage).

---

## 6. Confidentialité — règles non négociables

- **Jamais de numéro de licence ni de nom de naissance**, ni stocké ni affiché.
- **Pseudonymisation par catégorie** : nominatif à partir de U17, prénom + initiale
  en dessous. Le mode suit la **catégorie actuelle** du joueur, jamais celle d'une
  saison passée.
- **Cumul de carrière** : identifié par une empreinte stable (HMAC) du numéro de
  licence, jamais le numéro en clair. Le secret (`LICENCE_HASH_PEPPER`) doit être
  sauvegardé dans un gestionnaire de mots de passe partagé, hors des seuls secrets
  GitHub Actions — sa perte réinitialiserait silencieusement tout l'historique de
  cumul.
- **Règle des 3 saisons** : un joueur non vu depuis plus de 3 saisons complètes est
  retiré des données individuelles (pas seulement masqué à l'affichage — retiré des
  fichiers, car le dépôt est public). Les totaux d'équipe et scores restent inchangés.
- **Aucun PDF ne doit rester dans le dépôt git** : extraction faite une fois,
  résultat conservé, PDF supprimé (mode manuel : téléchargé puis supprimé par un
  robot après lecture ; mode automatique : téléchargé et supprimé dans le même
  build, avant tout commit). Un garde-fou CI vérifie qu'aucun PDF n'est présent
  dans un commit avant de continuer.
- **Catégorie Loisirs** : ses feuilles sont remplies après coup et ne reflètent pas
  la réalité — **jamais importées**, refusées explicitement avec message clair.
- **Pages sensibles (stats carrière, futurs records)** : jamais dans le header ni un
  menu, toujours `noindex`, accessibles uniquement par lien direct. Les records
  individuels ne citent que des joueurs en nom complet (U17+) ; pour les plus jeunes,
  des records d'équipe sans nommer d'enfant.
- **Historique pré-migration** : des PDF ont été commités avant cette règle ;
  décision du bureau en attente sur l'historique git.

---

## 7. Pièges déjà rencontrés — pour ne pas les refaire

- **Champ CMS vide ≠ champ absent.** Sveltia écrit `null` ou `""` pour un champ
  facultatif laissé vide, ce qui casse un schéma Astro strict. Tout champ optionnel
  doit être explicitement tolérant à `null`/chaîne vide.
- **Une date sans fuseau écrite par Sveltia est lue comme UTC par le YAML** :
  toute date saisie dans le CMS doit passer par `lireDateParis`.
- **Dossier vide non suivi par git.** Un `git add -A chemin/` échoue si `chemin/`
  n'existe pas (dossier vidé de tout son contenu par une migration). Un test en
  local peut passer à tort si le dossier existe encore localement — **toujours
  tester avec un clone neuf**, pas seulement en local.
- **Concurrency GitHub Pages** : plusieurs push rapprochés peuvent faire terminer une
  exécution ancienne APRÈS une plus récente, écrasant le site avec un état périmé.
  Correctif : toujours construire `ref: main` (la pointe), jamais le commit
  déclencheur — rend le résultat final indépendant de l'ordre d'arrivée des
  exécutions.
- **Agrégation par groupe qui resomme tout au lieu de filtrer.** Un bug a fait
  apparaître deux joueurs différents partageant prénom + initiale comme une seule
  "anomalie" apparente ET, séparément,
  un vrai bug de duplication (même joueur, deux totaux identiques sous Équipe 1 et
  Équipe 2) causé par une fonction d'agrégation qui ne filtrait pas par équipe.
  **Toujours vérifier un chiffre affiché en le recalculant depuis les données
  brutes avant de conclure "bug" ou "pas de bug".**
- **Deux sessions Claude Code en parallèle** peuvent modifier le même fichier.
  Règle adoptée : un seul push à la fois, vérification de l'état distant et
  notification à toute autre session active avant de pousser.
- **"All time" est un mensonge si les données ne remontent qu'à une saison donnée.**
  Toujours titrer avec la vraie date de départ des données ("Depuis 2022-2023"), pas
  un mot qui prétend l'exhaustivité.
- **Ne jamais promettre une fonctionnalité fondée sur une donnée absente.** Le badge
  "surclassé" envisagé un temps s'est avéré impossible (l'âge des joueurs n'est pas
  dans les feuilles) — remplacé par "plusieurs catégories la même saison", qui est
  réellement calculable.
- La comparaison de joueurs côte à côte a été volontairement retirée
  (risque de moqueries et de conflits) : ne pas la réintroduire sans décision du club.

---

## 8. Méthode de travail qui fonctionne sur ce projet

- **Diagnostic avant correction**, systématiquement, dès qu'un chiffre semble faux ou
  qu'un comportement surprend. Ne jamais corriger "en surface" sans avoir confirmé la
  cause réelle sur les données brutes.
- **Essai à blanc (`--dry-run`) avant toute suppression/migration de données**,
  avec un rapport chiffré (combien de lignes, combien de fichiers, qui est concerné)
  à valider avant exécution réelle.
- **Proposer la conception avant de coder** pour tout ce qui touche à
  l'architecture, aux données personnelles, ou à un mécanisme qui affecte
  plusieurs saisons/équipes à la fois. Ne pas laisser une session partir en
  exécution sur un sujet sensible sans validation explicite.
- **Vérification visuelle obligatoire** après toute modification d'affichage :
  captures desktop + mobile, jamais "ça devrait marcher".
- **Un chantier volumineux = plusieurs commits distincts**, pas un seul gros commit
  en fin de session — pour pouvoir isoler la cause si quelque chose casse.
- **Nouvelle conversation** recommandée quand : le sujet change de nature, la session
  en cours a accumulé beaucoup de détours, ou le chantier touche un domaine risqué
  (auth, workflow de déploiement) qui mérite un contexte propre.

---

## 9. État d'avancement (à mettre à jour au fil des sessions)

**Fait** : site vitrine complet (accueil, équipes, agenda, vie du club, recrutement,
mentions légales), CMS opérationnel, hero animé (diaporama photo), calendriers
FFHandball, import automatique des feuilles de match (manuel + automatique via
calendrier), historique 2020-2021 à 2026-2027 importé (2019-2020 volontairement
reporté), statistiques de saison et de carrière avec cumul par empreinte de licence,
liens cartographiques vers les gymnases, page Records en construction par phases.

**En cours / à reprendre** :
- Retenter les 43 feuilles 2022-2025 restées bloquées par la limite de débit.
- Phases B, C, D de l'amélioration des statistiques (records du club, graphiques,
  carte joueur partageable) — voir prompts dédiés.
- Décision du bureau à obtenir : que faire des PDF déjà dans l'historique git
  (laisser / retirer du dépôt / réécrire l'historique — non tranché).

**Pas commencé, volontairement reporté** : format de feuille 2019-2020 (peu de
joueurs actuels concernés, faible priorité) ; migration d'hébergement (le domaine
peut être acheté et pointé sur GitHub Pages sans migration complète) ; rôles/
permissions multiples dans le CMS (bloqué par la dépréciation de Git Gateway,
à réévaluer au moment de la migration).
