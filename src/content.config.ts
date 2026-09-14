import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { saisonPour } from "./lib/saison";

/**
 * Corrige un chemin d'image "nu" (ex. `src/assets/x.png`) que Sveltia CMS
 * écrit parfois par erreur à la place du chemin relatif attendu par le
 * schéma image() d'Astro (`../../assets/x.png`) -- observé en réutilisant
 * une image déjà présente dans la médiathèque partagée depuis un champ dont
 * la galerie/liste imbriquée ne l'a pas déclaré correctement. Sans ce
 * correctif, un tel chemin fait planter TOUT le build (erreur
 * [ImageNotFound]), pas seulement la page concernée -- voir git log pour
 * l'incident. Les chemins déjà valides (relatifs, commençant par "/", ou
 * des URLs) sont laissés tels quels : "/src/assets/x.png" fonctionne aussi
 * (résolu par Astro depuis la racine du projet), seul un chemin sans aucun
 * préfixe pose problème.
 */
function normalizeImagePath(value: string): string {
	const isUrl = value.includes("://");
	const isAbsolute = value.startsWith("/");
	const isRelative = value.startsWith(".");
	if (!value || isUrl || isAbsolute || isRelative) return value;
	const filename = value.split("/").pop();
	return `../../assets/${filename}`;
}

/** À utiliser à la place de `image()` seul pour chaque champ image d'une
 * collection : applique normalizeImagePath() avant de passer la valeur au
 * schéma image() d'Astro. */
function safeImage(image: () => z.ZodType<unknown, string>) {
	return z.string().transform(normalizeImagePath).pipe(image());
}

/**
 * Sveltia CMS écrit `null` (champ "number") ou une chaîne vide (champ
 * "string"/"select"/URL) pour un champ FACULTATIF laissé vide dans le
 * formulaire -- jamais l'absence pure de la clé en YAML. `.optional()` seul
 * ne suffit donc pas : `null` n'est pas `undefined` pour Zod, et une chaîne
 * vide reste une chaîne valide pour `z.string()` mais pas pour
 * `z.string().url()` ou un enum. Sans ce pré-traitement, vider un champ
 * facultatif depuis le CMS pouvait faire échouer TOUT le build -- incident
 * du 2026-09 sur l'équipe u15-masculins ("ordre" et
 * "calendriers.0.classementUrl" laissés vides à la création d'un calendrier).
 */
function videVersAbsent(valeur: unknown) {
	return valeur === null || valeur === "" ? undefined : valeur;
}

/**
 * Champ facultatif tolérant : une valeur vide (null/"" écrite par le CMS)
 * OU invalide (mauvais format, énumération inconnue...) devient simplement
 * "non renseigné" plutôt que de faire échouer le build. Deuxième niveau de
 * protection au-delà de `videVersAbsent` ci-dessus : une saisie imparfaite
 * depuis le CMS doit au pire dégrader l'affichage (le champ n'apparaît pas),
 * jamais bloquer la publication du site -- voir CLAUDE.md et le commentaire
 * de `videVersAbsent`. À utiliser pour tout champ dont l'appelant gère déjà
 * l'absence (`?? valeur par défaut`, `if (champ) ...`) : c'est le cas de
 * tous les champs facultatifs de ce fichier.
 */
function champFacultatif<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess(videVersAbsent, schema.optional().catch(undefined));
}

/** Comme `champFacultatif`, mais pour un champ qui a déjà une valeur de
 * repli "métier" (`.default()`) plutôt que "non renseigné" -- ex. le statut
 * d'une équipe, vide à tort, doit redevenir "active", pas disparaître. */
function champAvecDefaut<T extends z.ZodTypeAny>(schema: T, defaut: z.infer<T>) {
	return z.preprocess(videVersAbsent, schema.default(defaut).catch(defaut));
}

/** Pour les deux seuls champs liste "requis" du schéma (`galerie`,
 * `calendriers`) : une liste vide est une valeur de repli sûre et sans
 * ambiguïté (contrairement à un texte ou une image manquante, pour
 * lesquels il n'existe pas de repli qui ne serait pas trompeur) -- ces
 * champs restent donc "requis" au sens où ils doivent être un tableau,
 * mais `null` (jamais écrit intentionnellement par le CMS pour une liste,
 * mais toléré par précaution) est traité comme une liste vide plutôt que
 * de faire échouer le build. */
function listeTolerante<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess(videVersAbsent, schema.default([] as z.infer<T>).catch([] as z.infer<T>));
}

/**
 * Une équipe/catégorie du club. Conçue pour être éditée directement par un
 * futur back-office Sveltia CMS sans restructuration : chaque équipe est un
 * fichier Markdown indépendant dans src/content/equipes/, avec uniquement
 * des champs simples (texte, nombre, liste d'images).
 */
/** Un flux iCal de compétition rattaché à une équipe. Une équipe engagée
 * seule dans sa poule n'a qu'une entrée ; deux équipes du club engagées dans
 * la même poule (ex. Seniors masculins 1 et 2) ont chacune la leur, avec le
 * même `url` mais un `repere` différent -- c'est ce texte, tel qu'il
 * apparaît dans le flux ("Handball Islois 1"), qui permet de départager les
 * deux camps d'un même match. Voir src/lib/agenda.ts. */
const calendrierEquipe = z.object({
	url: z.string().url(),
	/** Texte qui identifie CETTE équipe dans le flux iCal. "Handball Islois"
	 * convient tant qu'une seule équipe du club joue dans cette poule ; à
	 * personnaliser ("Handball Islois 1"/"2"...) seulement en cas de partage
	 * de poule entre plusieurs équipes du club. */
	repere: champAvecDefaut(z.string(), "Handball Islois"),
	/** Affiché après le nom de l'équipe sur l'agenda pour distinguer
	 * plusieurs équipes du club dans la même poule (ex. "1", "2"). Vide dans
	 * le cas courant d'une seule équipe. */
	libelle: champFacultatif(z.string()),
	/** Laisser vide : déduit automatiquement de l'URL des rencontres du flux.
	 * À renseigner uniquement si la déduction échoue pour ce flux. */
	classementUrl: champFacultatif(z.string().url()),
});

const equipes = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/equipes" }),
	schema: ({ image }) =>
		z.object({
			/** Nom affiché (homepage, /equipes). */
			nom: z.string(),
			/** "competition" : équipes engagées en championnat.
			 * "decouverte" / "inclusion" : créneaux ouverts à tous (Baby Hand, Handensemble).
			 * "transversal" : créneau commun à plusieurs catégories (étirements/spé gardien). */
			type: z.enum(["competition", "decouverte", "inclusion", "transversal"]),
			/** "active" (par défaut) ou "archivee" -- une équipe qui s'arrête
			 * (dissoute, catégorie non reconduite...) passe en "archivee" plutôt
			 * que d'être supprimée : ses résultats passés doivent rester
			 * consultables (voir /equipes, section "Équipes des saisons
			 * passées"). Une équipe archivée disparaît de l'effectif affiché
			 * (plus d'horaires/tarif/agenda, ça n'a plus de sens) mais garde son
			 * `slug`, donc ses résultats dans la collection "resultats". */
			statut: champAvecDefaut(z.enum(["active", "archivee"]), "active"),
			/** Identifiant stable : ancre sur /equipes (#slug) ET clé de
			 * correspondance avec `equipeSlug` dans la collection "resultats".
			 * Ne jamais changer une fois publié (ça casserait les liens
			 * existants, l'agenda et le rattachement des résultats). */
			slug: z.string(),
			/** Ordre d'affichage (homepage + /equipes), au sein de son "type".
			 * Facultatif : pour toute équipe ayant une `categorieAge` (voir plus
			 * bas), l'ordre est calculé automatiquement (du plus jeune au plus
			 * âgé) et ce champ est ignoré même renseigné. Il ne sert que
			 * d'exception manuelle pour les créneaux sans catégorie d'âge
			 * (Loisirs, Découverte, Inclusion, créneau transversal) -- voir
			 * src/lib/equipes.ts, trierEquipes(). */
			ordre: champFacultatif(z.number()),
			horaires: z.string(),
			encadrants: z.string(),
			tarif: z.string(),
			/** Texte court (1-2 phrases) : survol de la carte sur la homepage ET
			 * texte affiché sur /equipes. */
			description: z.string(),
			/** Photo utilisée sur la carte homepage ET en tête de la page équipe.
			 * Chemin relatif à ce fichier. */
			photoProfil: safeImage(image),
			/** Photos du carrousel sur /equipes (peut inclure ou non photoProfil).
			 * Chemins relatifs à ce fichier. */
			galerie: listeTolerante(z.array(safeImage(image))),
			/** Mode d'affichage des stats individuelles dans le bloc "Résultats" de
			 * cette équipe sur /equipes : "nominatif" (prénom + nom complet),
			 * "pseudonymise" (prénom + initiale, ex. "Théo M.") ou "masque" (aucune
			 * stat individuelle affichée, seules les stats d'équipe le sont).
			 * Par défaut pseudonymisé (le choix le plus prudent) -- mettre
			 * "nominatif" explicitement pour les équipes seniors (majeurs). */
			affichageStats: champAvecDefaut(z.enum(["nominatif", "pseudonymise", "masque"]), "pseudonymise"),
			/** Catégorie d'âge de la compétition FFHandball ("U9", "U13", "U17",
			 * "senior"...), exactement comme elle apparaît dans le nom de la
			 * compétition sur les feuilles de match. Sert UNIQUEMENT au
			 * rattachement automatique d'une feuille de match déposée à cette
			 * équipe (voir src/lib/fdme/equipeMatch.mjs) -- absent pour un
			 * créneau qui ne joue pas de championnat classé par âge (Loisirs,
			 * Découverte, Handensemble, créneau transversal). Format libre
			 * (pas un enum) pour qu'une nouvelle catégorie jamais vue auparavant
			 * (ex. un futur U20) fonctionne sans modification de ce fichier --
			 * seule la fiche équipe doit être créée dans le CMS. */
			categorieAge: champFacultatif(z.string().regex(/^(U\d{1,2}|senior)$/, 'Doit être "U" suivi de l\'âge (ex. U13), ou "senior".')),
			/** Genre de la compétition -- avec `categorieAge`, sert au
			 * rattachement automatique d'une feuille de match (voir
			 * src/lib/fdme/equipeMatch.mjs). Absent si `categorieAge` l'est. */
			genre: champFacultatif(z.enum(["mixte", "feminin", "masculin"])),
			/** Calendriers FFHandball (flux iCal) de cette équipe. Vide tant que
			 * le calendrier de la saison n'a pas été publié par la fédération, ou
			 * pour un créneau qui ne joue pas de championnat -- l'équipe
			 * n'apparaît alors simplement pas dans l'agenda, sans erreur. Deux
			 * entrées pour une équipe engageant deux équipes dans la même poule
			 * (ex. Seniors masculins 1 et 2). Voir src/lib/agenda.ts, qui
			 * remplace l'ancien src/data/agenda-teams.config.ts. */
			calendriers: listeTolerante(z.array(calendrierEquipe)),
		}),
});

/**
 * Un article "Vie du club" (tournois, moments conviviaux, etc). Contenu
 * Markdown classique : le corps du fichier EST le contenu de l'article
 * (pas de champ "contenu" séparé) -- pratique pour un futur éditeur
 * Sveltia CMS (widget Markdown standard).
 */
const articles = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/articles" }),
	schema: ({ image }) =>
		z.object({
			titre: z.string(),
			date: z.coerce.date(),
			couverture: safeImage(image),
			/** 1-2 phrases affichées dans la liste /vie-du-club. */
			extrait: z.string(),
			/** Identifiant stable : URL /vie-du-club/slug. */
			slug: z.string(),
		}),
});

/**
 * Un partenaire/sponsor du club, affiché sur la homepage. Un fichier par
 * partenaire, comme les autres collections -- prêt pour un futur back-office
 * Sveltia CMS.
 */
const partenaires = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/partenaires" }),
	schema: ({ image }) =>
		z.object({
			nom: z.string(),
			logo: safeImage(image),
			/** Site du partenaire -- le logo y renvoie en lien externe. */
			url: z.string().url(),
			/** Optionnelle : pas affichée pour l'instant (la section reste
			 * volontairement sobre, logos seuls), disponible si besoin plus tard. */
			description: champFacultatif(z.string()),
		}),
});

/**
 * Les photos du bandeau "La vie du club, en images" sur la homepage
 * (composant PhotoBand.astro). Un seul fichier (id "page"), sur le même
 * principe de "page singleton" que "leClub" ci-dessous -- toutes les photos
 * vivent dans un unique champ liste (`photos`), réordonnable par
 * glisser-déposer dans Sveltia CMS. Remplace l'ancien "un fichier par photo"
 * avec un `ordre` numérique saisi à la main (source d'erreurs constatée en
 * production : deux photos s'étaient déjà retrouvées avec le même numéro).
 */
const photosAccueil = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/photos-accueil" }),
	schema: ({ image }) =>
		z.object({
			photos: z.array(
				z.object({
					image: safeImage(image),
					/** Texte alternatif (accessibilité) décrivant la photo. */
					alt: z.string(),
				}),
			),
		}),
});

/**
 * Le contenu de la page unique /le-club : histoire, parrain, infos
 * pratiques. Un seul fichier (id "page"), sur le même principe de "page
 * singleton" que les autres collections -- éditable depuis Sveltia CMS via
 * une collection "fichier" (pas de création/suppression, un seul enregistrement).
 */
const leClub = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/le-club" }),
	schema: ({ image }) =>
		z.object({
			/** Paragraphes avant la devise (séparés par une ligne vide). */
			histoireIntro: z.string(),
			/** Citation mise en avant, affichée entre guillemets. */
			devise: z.string(),
			/** Paragraphe(s) après la devise. */
			histoireConclusion: z.string(),
			parrainNom: z.string(),
			parrainPhoto: safeImage(image),
			parrainPhotoAlt: z.string(),
			/** Paragraphes de présentation du parrain (séparés par une ligne vide). */
			parrainTexte: z.string(),
			lieuNom: z.string(),
			lieuAdresse: z.string(),
			telephone: z.string(),
			email: z.string(),
			instagramUrl: z.string().url(),
			facebookUrl: z.string().url(),
		}),
});

/**
 * Un moment marquant ou une figure de l'histoire du club, affiché sur
 * /le-club. Collection vide pour l'instant (prête à être remplie) -- un
 * fichier par entrée, comme les autres collections.
 */
const histoireClub = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/histoire-club" }),
	schema: ({ image }) =>
		z.object({
			titre: z.string(),
			/** Texte libre : une date, une saison, une période ("1977",
			 * "Saison 2010-2011", "Années 1990"...). */
			periode: z.string(),
			texte: z.string(),
			photo: champFacultatif(safeImage(image)),
			photoAlt: champFacultatif(z.string()),
			/** Ordre d'affichage (chronologique ou autre, au choix). */
			ordre: z.number(),
		}),
});

/** Un point de la chronologie d'un match : le score cumulé au moment de
 * l'événement, pour tracer le graphique d'évolution du score. `mi_temps` et
 * `fin_match` sont des points de repère recalés sur le score officiel
 * (bloc "Détail score" de la feuille), pas comptés depuis la chronologie
 * brute -- voir le commentaire dans src/lib/fdme/parseFeuille.mjs sur les
 * rares lignes sans horodatage exploitable en fin de période. */
const chronologieEvenement = z.object({
	temps: z.string(),
	scoreDomicile: z.number(),
	scoreExterieur: z.number(),
	type: z.enum([
		"but",
		"exclusion",
		"avertissement",
		"disqualification",
		"tir_manque",
		"arret",
		"mi_temps",
		"fin_match",
		"autre",
	]),
});

const statsEquipeMatch = z.object({
	buts: z.number(),
	tirs: z.number(),
	arrets: z.number(),
	exclusions: z.number(),
	avertissements: z.number(),
});

/** Stats d'un·e joueur·se du HBI sur un match -- jamais celles de l'équipe
 * adverse (aucune raison de publier les stats nominatives d'enfants d'un
 * autre club). Le prénom/nom complet est toujours stocké ; c'est
 * l'affichage qui dépend du réglage `affichageStats` de l'équipe (voir
 * content.config.ts > equipes). Jamais de numéro de licence ni de nom de
 * naissance, ni ici ni ailleurs. */
const statJoueurMatch = z.object({
	numero: z.number(),
	prenom: z.string(),
	nom: z.string(),
	buts: z.number(),
	sept_m: z.number(),
	tirs: z.number(),
	arrets: z.number(),
	avertissements: z.number(),
	exclusions: z.number(),
	disqualification: z.boolean(),
});

/**
 * Le résultat d'un match. Une entrée par rencontre, soit générée
 * automatiquement à partir d'une feuille de match PDF importée (voir
 * src/content/feuilles-match/ et scripts/import-fdme.mjs, exécuté avant
 * chaque build), soit saisie à la main en secours quand aucune feuille n'a
 * été récupérée (score et infos de base uniquement dans ce cas).
 *
 * Les entrées générées automatiquement sont *recalculées à chaque build*
 * depuis leur PDF source (fichier nommé `pdf-<codeRencontre>.md`, jamais
 * dupliqué), puis commitées par le workflow de déploiement (voir
 * .github/workflows/deploy.yml) pour rester visibles et corrigeables
 * depuis le CMS : les champs `chronologie`, `statsEquipeDomicile/Exterieur`
 * et `statsJoueurs` y sont donc écrasés à chaque reconstruction du site --
 * ne pas les modifier à la main, ce serait perdu au prochain build. Seul
 * `equipeSlug` est préservé si vous le corrigez à la main (voir
 * scripts/import-fdme.mjs) : utile quand l'équipe n'a pas été détectée
 * automatiquement à partir du nom de la compétition.
 */
const resultats = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/resultats" }),
	schema: z
		.object({
			source: champAvecDefaut(z.enum(["pdf", "manuel"]), "manuel"),
			/** Identifiant FFHandball de la rencontre (ex. "VAGEXGV") -- clé de
			 * déduplication pour les entrées générées depuis une feuille de match.
			 * Absent pour une entrée saisie à la main. */
			codeRencontre: champFacultatif(z.string()),
			/** Doit correspondre au `slug` d'une entrée de la collection "equipes". */
			equipeSlug: z.string(),
			/** Quand plusieurs équipes du club sont engagées dans la même
			 * catégorie (ex. Seniors masculins 1 et 2, qui partagent le même
			 * `equipeSlug`) : lequel des deux a joué ce match. Extrait
			 * automatiquement du nom d'équipe sur la feuille de match ("HANDBALL
			 * ISLOIS 2" -> "2", voir extraireNumeroEquipe() dans
			 * src/lib/fdme/equipeMatch.mjs) ; à renseigner à la main uniquement
			 * pour un résultat saisi en secours. Absent la plupart du temps :
			 * soit une équipe seule dans sa catégorie (rien à afficher), soit
			 * la première équipe engagée -- son nom reste "HANDBALL ISLOIS" sans
			 * suffixe sur la feuille -- traitée comme "1" par défaut à
			 * l'affichage (voir libelleEquipeAffiche() dans src/lib/resultats.ts)
			 * uniquement quand `aPlusieursEquipes()` (même fichier) détecte qu'un
			 * partage de poule existe bel et bien pour cette équipe. */
			equipeNumero: champFacultatif(z.string()),
			date: z.coerce.date(),
			/** Ex. "J1". Absent pour un match de coupe ou amical. */
			journee: champFacultatif(z.string()),
			competition: champFacultatif(z.string()),
			typeMatch: champAvecDefaut(z.enum(["championnat", "coupe", "autre"]), "championnat"),
			/** true si le HBI recevait. */
			domicile: z.boolean(),
			adversaire: z.string(),
			salle: champFacultatif(z.string()),
			/** Rencontre non disputée : qui a déclaré forfait. Absent pour un
			 * match normalement joué (l'immense majorité des cas). Quand
			 * renseigné, `scoreDomicile`/`scoreExterieur` restent vides : pas de
			 * score ni de statistiques pour un match qui n'a pas eu lieu -- voir
			 * issueDuMatch() dans src/lib/resultats.ts, qui déduit directement
			 * victoire/défaite de ce champ sans passer par un score. */
			forfait: champFacultatif(z.enum(["nous", "adversaire"])),
			scoreDomicile: champFacultatif(z.number()),
			scoreExterieur: champFacultatif(z.number()),
			scoreMiTempsDomicile: champFacultatif(z.number()),
			scoreMiTempsExterieur: champFacultatif(z.number()),
			chronologie: champFacultatif(z.array(chronologieEvenement)),
			statsEquipeDomicile: champFacultatif(statsEquipeMatch),
			statsEquipeExterieur: champFacultatif(statsEquipeMatch),
			statsJoueurs: champFacultatif(z.array(statJoueurMatch)),
		})
		/** `saison` (ex. "2025-2026") n'est jamais un champ saisi ou importé :
		 * elle est recalculée depuis `date` à chaque lecture de la collection,
		 * pour une entrée générée depuis une feuille de match comme pour une
		 * entrée saisie à la main -- jamais périmée, même si la date d'une
		 * entrée manuelle est corrigée après coup. Voir src/lib/saison.ts. */
		.transform((data) => ({ ...data, saison: saisonPour(data.date) })),
});

export const collections = { equipes, articles, partenaires, photosAccueil, leClub, histoireClub, resultats };
