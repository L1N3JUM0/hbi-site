/**
 * Compétitions dont les feuilles de match ne doivent jamais alimenter le
 * site (décisions du club). Liste explicite et unique, partagée par l'import
 * des feuilles (scripts/import-fdme.mjs) et par leur récupération
 * automatique : toute nouvelle exclusion s'ajoute ici, jamais par un
 * contournement ponctuel ailleurs.
 *
 * `refuseeAImport` : même déposée à la main dans le CMS, la feuille est
 * refusée (bandeau explicite) au lieu d'être importée. Sinon, la catégorie
 * est seulement ignorée par la récupération automatique ; un dépôt manuel
 * reste possible.
 *
 * Reconnue sur le libellé de compétition tel qu'il figure sur la feuille ou
 * sur ffhandball.fr (accents et casse ignorés).
 */
export const CATEGORIES_IGNOREES = [
	{
		libelle: "Loisirs",
		motif: /\bLOISIRS?\b/,
		refuseeAImport: true,
		// Règle du club : ces feuilles sont remplies après coup, leurs
		// données ne sont pas fiables.
		raison: "Feuille de la catégorie Loisirs : ces feuilles sont remplies après coup, elles ne sont jamais importées sur le site (règle du club). Supprimez-la de « Feuilles de match ».",
	},
	{
		libelle: "Tournoi ETF",
		motif: /\bTOURNOI\s+ETF\b/,
		refuseeAImport: false,
		raison: "Tournoi ETF : non récupéré automatiquement.",
	},
];

function normaliser(texte) {
	return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/** @param {string|undefined} competition @returns {typeof CATEGORIES_IGNOREES[number] | null} */
export function categorieIgnoree(competition) {
	if (!competition) return null;
	const texte = normaliser(competition);
	return CATEGORIES_IGNOREES.find((c) => c.motif.test(texte)) ?? null;
}
