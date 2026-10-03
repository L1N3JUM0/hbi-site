# Investigation : créneaux provisoires pour les journées non programmées

Date : 03/10/2026. Session d'investigation uniquement : aucun fichier du site
n'a été modifié.

Objectif visé : afficher dans l'agenda « Journée N — week-end du X-Y, horaire
à confirmer » pour les matchs que le club recevant n'a pas encore programmés,
puis remplacer automatiquement ce créneau par le vrai match dès que la
fédération le publie.

## 0. Limite de l'investigation : flux ICS injoignable depuis cette session

`competition-calendar.ffhandball.fr` est **bloqué par la politique réseau de
l'environnement cloud** (403 au CONNECT du proxy, deux tentatives espacées,
pas de nouvel essai). `www.ffhandball.fr` est en revanche joignable.

Les constats sur l'ICS (partie 1) sont donc **indirects** : ils s'appuient
sur le code existant (qui parse ces flux), sur l'historique Git de
`src/data/feuilles-auto.json` (indexé par UID ICS) et sur les données de la
page compétition. Ils sont marqués « déduit » quand ce n'est pas une
observation directe. Pour confirmer, il suffit d'ajouter
`competition-calendar.ffhandball.fr` aux domaines autorisés de
l'environnement et de relancer la partie 1.

## 1. Flux ICS (c-32649 Seniors M, c-32648 Seniors F)

| Question | Réponse | Fiabilité |
|---|---|---|
| Matchs non programmés présents ? | **Non** : le flux ne contient que les matchs datés. | Déduit, fort |
| Numéro de journée ? | **Oui**, dans `DESCRIPTION` : `"DIVISION 1 MASCULINS - Journée 1"` | Établi (code en production) |
| Adversaire / domicile ? | Adversaire : `SUMMARY` `"RECEVANT vs VISITEUR"`. Domicile : 1er nom = recevant, + `LOCATION` (« Emile Avy »). | Établi |
| UID stable ? | **Oui très probablement** : l'UID est l'identifiant interne fédéral de la rencontre, créé dès le tirage de la poule, avant toute date. | Déduit, fort |

Détails :

- **Absence des matchs non datés.** Le commentaire de `src/lib/agenda.ts`
  relève 36 événements sur 10 flux au 28/09/2026, soit environ 3,6 par flux.
  Une poule de 9 équipes compte 16 matchs par équipe sur la saison (18
  journées, 2 exemptions). Si les rencontres non datées figuraient dans le
  flux, on compterait au moins 16 événements par équipe. Le nombre observé
  correspond aux 2-3 premières journées déjà datées. Côté fédération, une
  rencontre non programmée a `date: null` (voir partie 2) ; un VEVENT exige
  un `DTSTART`, ce qui explique qu'elle ne soit pas exportée plutôt que
  datée à 00:00. Conséquence : **rien à « détecter » dans le flux**, un
  match non programmé y est simplement absent.
- **UID = `id` interne de la rencontre.** Les clés de `feuilles-auto.json`
  (UID ICS) correspondent aux `id` du JSON de la page poule, et l'URL ICS
  contient l'`ext_rencontreId` :

  ```
  UID ICS 3017851  ->  URL …/poule-192119/rencontre-2670110/   (J1)
  page J4 : id 3017863, ext_rencontreId 2670125
  page J12 (non datée) : id 3017895 … 3017898, ext 2670165 … 2670168
  ```

  Les `id` de la J12, non programmée, existent déjà et suivent la même
  séquence. L'UID est donc attribué au tirage, pas lors de la
  programmation. Il n'y a cependant que 6 commits dans l'historique, et
  aucun ne montre un même UID dont la date aurait changé : la stabilité
  lors d'un report n'a pas été observée directement.

## 2. Page compétition (Seniors masculins, poule 192119)

URL : `https://www.ffhandball.fr/competitions/saison-2026-2027-22/departemental/division-1-masculins-32649/poule-192119/`
(+ `journee-N/` pour une journée précise). 3 requêtes au total, espacées de
3 s.

**Les données sont dans le HTML statique**, sous forme de JSON dans les
attributs `<smartfire-component name='…' attributes="…">`. C'est le même
mécanisme que `scripts/import-stats-ffhandball.mjs`, donc la page se lit
sans navigateur piloté.

- `competitions---journee-selector` → `poule.journees` : **toutes les
  journées de la saison avec leurs dates de week-end**, dès maintenant :

  ```json
  {"journee_numero":4,"date_debut":"2026-10-10","date_fin":"2026-10-11"},
  {"journee_numero":5,"date_debut":"2026-11-07","date_fin":"2026-11-08"},
  …
  {"journee_numero":18,"date_debut":"2027-05-29","date_fin":"2027-05-30"}
  ```

- `competitions---rencontre-list` → `rencontres` de la journée affichée
  (une seule journée par page : la prochaine par défaut, sinon `journee-N/`).
  Pour une journée **non programmée**, les adversaires et le recevant sont
  déjà connus, seule la date manque :

  ```
  J12  id 3017896  date=null  AVIGNON HANDBALL      - HANDBALL ISLOIS 1
  J12  id 3017897  date=null  HANDBALL CONCERNADE   - HANDBALL ISLOIS 2
  J4   id 3017863  date=2026-10-11T14:30:00+02:00  HANDBALL CONCERNADE - HANDBALL ISLOIS 1
  ```

  `equipe1` = recevant (même convention que l'ICS).
- **Exemptions** : aucun champ explicite (« exempt » absent de la page).
  Elles se déduisent : poule de 9 équipes (`mini-classement`), 4 rencontres
  par journée, et l'équipe absente de la liste est exemptée (ex. Avignon en
  J4, Carpentras en J12).
- Limite : une requête par journée pour connaître les adversaires de toute
  la saison, soit environ 18 requêtes par poule et ~150 pour les ~8 poules
  du club. Il faudrait les espacer (1,5 s comme l'import des stats) et ne
  pas les lancer à chaque build. Les **dates de week-end** seules
  s'obtiennent en **1 requête par poule**.

## 3. Recommandation

**C (B + enrichissement automatique)**, en commençant par un « C léger » :

1. **A est écarté** : le flux ICS n'expose pas les matchs non programmés.
   Il ne sert qu'à faire disparaître un créneau provisoire au moment où le
   vrai match apparaît (correspondance sur l'UID = `id` de la rencontre, ou
   à défaut sur équipe + journée).
2. **B seul fonctionne mais fait doublon** avec une donnée que la
   fédération publie déjà de façon fiable et lisible (dates de week-end).
   La saisie manuelle de ~18 week-ends × 8 poules est une source d'erreurs
   et de désynchronisation (journées déplacées par le comité).
3. **Proposition** :
   - script de prébuild (sur le modèle de `import-stats-ffhandball.mjs`)
     qui lit **une page par poule** et enregistre `poule.journees` dans un
     fichier de contenu versionné. Pour savoir si l'équipe joue (et contre
     qui, à domicile ou non), on peut ajouter les pages `journee-N/` des
     seules journées à venir non encore présentes dans l'ICS, avec cache et
     cadence lente ;
   - **dans le CMS, seulement une surcharge facultative** (forcer ou masquer
     un créneau, signaler une exemption) plutôt qu'une saisie complète. Ce
     serait le « B » de secours si la fédération change son format ;
   - règle d'affichage : créneau provisoire si la journée N n'a pas de match
     ICS pour l'équipe et que l'équipe n'est pas exemptée ; il disparaît dès
     qu'un VEVENT de cette journée existe.

Points à valider avant implémentation :

- confirmer la partie 1 en accès direct à l'ICS (domaine à autoriser) ;
- vérifier que les poules à phases (U13/U11, « Inter Dép ») exposent aussi
  `journees` ;
- choisir entre « week-end seul » (1 requête par poule) et « week-end +
  adversaire » (requêtes par journée).
