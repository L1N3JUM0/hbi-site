import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

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
 * Une équipe/catégorie du club. Conçue pour être éditée directement par un
 * futur back-office Sveltia CMS sans restructuration : chaque équipe est un
 * fichier Markdown indépendant dans src/content/equipes/, avec uniquement
 * des champs simples (texte, nombre, liste d'images).
 */
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
			/** Identifiant stable : ancre sur /equipes (#slug) ET clé de
			 * correspondance avec agendaTeams[].equipeSlug dans
			 * src/data/agenda-teams.config.ts. Ne jamais changer une fois publié
			 * (ça casserait les liens existants et la correspondance agenda). */
			slug: z.string(),
			/** Ordre d'affichage (homepage + /equipes), au sein de son "type". */
			ordre: z.number(),
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
			galerie: z.array(safeImage(image)),
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
			description: z.string().optional(),
		}),
});

/**
 * Une photo du bandeau "La vie du club, en images" sur la homepage
 * (composant PhotoBand.astro). Un fichier par photo, comme les autres
 * collections -- éditable depuis Sveltia CMS.
 */
const photosAccueil = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/photos-accueil" }),
	schema: ({ image }) =>
		z.object({
			image: safeImage(image),
			/** Texte alternatif (accessibilité) décrivant la photo. */
			alt: z.string(),
			/** Ordre de passage dans le carrousel (1 = en premier). */
			ordre: z.number(),
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
			photo: safeImage(image).optional(),
			photoAlt: z.string().optional(),
			/** Ordre d'affichage (chronologique ou autre, au choix). */
			ordre: z.number(),
		}),
});

export const collections = { equipes, articles, partenaires, photosAccueil, leClub, histoireClub };
