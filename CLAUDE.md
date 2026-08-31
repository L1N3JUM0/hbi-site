# Projet : Site du HBI (Handball Islois)

## Contexte
Site vitrine du club de handball de L'Isle-sur-la-Sorgue (84800).
Priorités : 1) image/notoriété, 2) infos pratiques, 3) recrutement,
4) adhésions/dons. Public : familles et jeunes joueurs. Mobile-first.

## Identité du club
- Fondé le 8 novembre 1977 par Jean Guillen (45+ ans)
- Présidente : Sonia Saux (depuis 2015-2016)
- Devise : « je ne perds jamais : soit je gagne, soit j'apprends »
- Valeurs : esprit de famille, solidarité, respect, convivialité
- Effectif complet saison 2026-2027 (14 lignes, pas "12 équipes" à
  proprement parler) : Baby hand (4-6 ans, samedi 9h-10h, DÉCOUVERTE),
  U9 mixtes, U11 mixtes, U13 féminines, U13 masculins, U15 féminines,
  U15 masculins, U17 féminines, U18 masculins, Seniors féminines,
  Seniors masculins, Loisirs, Handensemble (handball adapté/inclusif,
  mercredi 18h-19h, DÉCOUVERTE/INCLUSION), et le créneau transversal
  étirements/renforcement/spé gardien (U15 à Seniors).
  Baby hand et Handensemble ne sont PAS des équipes de compétition —
  toujours les présenter à part (ton "découverte"/"ouvert à tous"),
  jamais mélangées sans distinction dans une liste de "12 équipes".
- Parrain officiel : Hugo Brouzet, pivot professionnel au PAUC (Pays
  d'Aix Université Club Handball), évoluant en LNH Division 1 /
  Starligue. Photo réelle fournie séparément par le club — en attendant,
  placeholder src/assets/hugo-brouzet-stage.jpg à remplacer.
- Lieu d'entraînement OFFICIEL UNIQUE : COSEC Émile Avy.
  Adresse : Avenue Jean Bouin, 84800 L'Isle-sur-la-Sorgue (pas de numéro
  de rue).
  Ne jamais afficher le Gymnase Jean Garcin comme lieu du club : c'est un
  arrangement inter-clubs temporaire pour la seule saison en cours,
  concernant certains créneaux U15/U17 féminines. Ne pas l'indiquer sur le
  site sauf mention contextuelle explicite si le club le demande.
- Réseaux : Facebook "Handball Islois", Instagram @handball_islois
- Contact : 06 26 62 15 44 / 6384006@sud.ffhandball.net
- Domaine handballislois.fr : probablement non acheté/activé par le club.
  Ne pas le référencer comme site actuel sans confirmation.
- Adhésions/dons : redirection HelloAsso uniquement

## Identité visuelle (OFFICIELLE — extraite du vrai logo, ne pas réinventer)
- Bleu de marque : #0259AA
- Marine profond (fonds) : #012891 / #001749
- Accent rouge-fuchsia (CTA, mise en avant) : #BB034D
- Blanc : #FFFFFF
- Direction retenue : fond bleu marine dominant, dont se détachent des
  blocs et textes blancs/fuchsia — cohérent avec les flyers existants du
  club (Canva), qu'il s'agit de prolonger sur le web, pas de remplacer par
  une nouvelle identité.
- Logo officiel : silhouettes de joueurs en aplat #0259AA sur fond blanc.
  Un tracé vectoriel propre du joueur en position de tir est disponible
  dans src/assets/player/ — c'est LA référence de style pour tout élément
  graphique dérivé du logo (silhouettes, animations).
- Typographie : à définir en cohérence avec cette identité (condensée,
  costaude, esprit sportif/tableau de score plutôt que corporate).

## Architecture (NON NÉGOCIABLE)
- Astro, 100 % statique. PAS de base de données, PAS de comptes
  utilisateurs, PAS de backend, PAS de paiement sur le site.
- Hébergement Cloudflare Pages / Netlify à terme (démo actuelle sur
  GitHub Pages en attendant l'achat d'un hébergement définitif par le
  club — configurer le `base` d'astro.config.mjs en conséquence).
- CMS : Sveltia CMS, contenu en Markdown dans le dépôt
- Animations : CSS natif ou package `motion`, sobres, un seul moment
  orchestré par section, respecter prefers-reduced-motion partout
- Images : AVIF/WebP, responsive, lazy loading, < 200 Ko
- Couleurs : UNIQUEMENT via les tokens de src/styles/tokens.css, dérivés
  de la palette officielle ci-dessus — jamais de couleur en dur ailleurs

## Contraintes RGPD (strictes)
- ZÉRO cookie tiers. Pas d'embed Instagram/Facebook natif,
  pas de Google Fonts en CDN (auto-héberger les polices),
  pas de Google Analytics.
- Instagram : récupération côté serveur au build, images mises en cache
  localement et servies depuis notre domaine.
- Ne jamais publier de photo de mineur sans mention de l'autorisation
  parentale.
- Secrets uniquement dans .env.local (gitignoré), jamais côté client.

## Accessibilité
WCAG AA, texte >= 16px, cibles tactiles >= 44px, navigation clavier.

## Style
- Français pour le contenu, anglais pour le code
- Composants petits et réutilisables
- Commenter le "pourquoi", pas le "quoi"

## À ne pas faire
- Pas de dark mode, pas de librairie UI massive
- Ne pas réintroduire d'espace licencié, de stats individuelles
  ou de galerie photo hébergée : décisions actées.
- Ne jamais afficher le Gymnase Jean Garcin comme lieu officiel.
- Ne pas inventer de nouvelle palette : toujours partir de l'identité
  visuelle officielle décrite plus haut.
