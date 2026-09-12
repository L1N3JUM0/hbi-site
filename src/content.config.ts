import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

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
			/** photos[0] est utilisée sur la homepage ; la liste complète
			 * alimente le carrousel de /equipes. Chemins relatifs à ce fichier. */
			photos: z.array(image()),
		}),
});

export const collections = { equipes };
