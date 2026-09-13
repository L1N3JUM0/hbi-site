/**
 * Résout l'équipe HBI concernée par une feuille de match à partir du texte
 * de la compétition (ex. "CHAMPIONNAT U15 EXCELLENCE FEMININ U15F EXC").
 *
 * Ne dépend PAS de src/data/agenda-teams.config.ts : ce fichier ne couvre
 * que les équipes ayant un flux iCal configuré (3 aujourd'hui), alors
 * qu'une feuille de match peut concerner n'importe quelle équipe de
 * compétition du club. La correspondance se fait donc directement contre
 * les slugs de la collection "equipes" (liste fixée pour la saison, voir
 * CLAUDE.md) via l'âge + le genre détectés dans le nom de la compétition.
 *
 * Si l'effectif du club change (nouvelle catégorie), mettre à jour la table
 * SLUG_PAR_AGE_GENRE ci-dessous en même temps que src/content/equipes/.
 */

const AGE_PATTERN = /\bU\s?(9|11|13|15|17|18)\b/i;
const FEMININ_PATTERN = /f[ée]minin/i;
const MASCULIN_PATTERN = /masculin/i;
const COUPE_PATTERN = /\bcoupe\b/i;

/** U9/U11 sont mixtes dans ce club : le genre du nom de compétition (le cas
 * échéant) est ignoré pour ces deux âges. U17 n'existe qu'en féminines et
 * U18 qu'en masculins pour ce club (voir CLAUDE.md) : pas d'ambiguïté à
 * résoudre, mais on vérifie que le genre détecté ne les contredit pas. */
const SLUG_PAR_AGE_GENRE = {
	9: { mixte: "u9-mixtes" },
	11: { mixte: "u11-mixtes" },
	13: { feminin: "u13-feminines", masculin: "u13-masculins" },
	15: { feminin: "u15-feminines", masculin: "u15-masculins" },
	17: { feminin: "u17-feminines" },
	18: { masculin: "u18-masculins" },
};

/**
 * @param {string} competitionText
 * @returns {{ equipeSlug: string | null, typeMatch: "championnat" | "coupe" }}
 */
export function detectEquipe(competitionText) {
	const typeMatch = COUPE_PATTERN.test(competitionText) ? "coupe" : "championnat";

	const ageMatch = AGE_PATTERN.exec(competitionText);
	const feminin = FEMININ_PATTERN.test(competitionText);
	const masculin = MASCULIN_PATTERN.test(competitionText);

	if (ageMatch) {
		const age = Number(ageMatch[1]);
		const options = SLUG_PAR_AGE_GENRE[age];
		if (!options) return { equipeSlug: null, typeMatch };
		if (options.mixte) return { equipeSlug: options.mixte, typeMatch };
		if (feminin && options.feminin) return { equipeSlug: options.feminin, typeMatch };
		if (masculin && options.masculin) return { equipeSlug: options.masculin, typeMatch };
		// Âge reconnu mais genre absent/inattendu du texte : un seul genre
		// existe pour cet âge dans ce club, on peut le déduire sans ambiguïté.
		const only = options.feminin ?? options.masculin;
		if (only && !feminin && !masculin) return { equipeSlug: only, typeMatch };
		return { equipeSlug: null, typeMatch };
	}

	// Pas d'âge détecté : on suppose seniors (aucune autre catégorie adulte
	// n'a de sigle d'âge dans son nom de compétition).
	if (feminin) return { equipeSlug: "seniors-feminines", typeMatch };
	if (masculin) return { equipeSlug: "seniors-masculins", typeMatch };
	return { equipeSlug: null, typeMatch };
}

/** Code FFHandball du club (voir l'e-mail de contact dans CLAUDE.md,
 * 6384006@sud.ffhandball.net) : préfixe des numéros de licence de tous les
 * licencié·e·s du HBI. Signal fiable pour savoir quel camp de la feuille
 * est le HBI, indépendamment de l'orthographe exacte du nom d'équipe
 * ("HANDBALL ISLOIS", "HANDBALL ISLOIS 1"...). */
export const CLUB_CODE = "6384006";
export const CLUB_NAME_PATTERN = /handball\s*islois/i;
