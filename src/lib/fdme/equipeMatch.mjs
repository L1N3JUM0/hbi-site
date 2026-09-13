/**
 * Résout l'équipe HBI concernée par une feuille de match à partir du texte
 * de la compétition (ex. "CHAMPIONNAT U15 EXCELLENCE FEMININ U15F EXC").
 *
 * Ne contient plus de table câblée en dur : la liste des équipes de
 * compétition (slug + catégorie d'âge + genre) est lue depuis la collection
 * "equipes" du CMS (champs `categorieAge`/`genre`, voir content.config.ts) et
 * passée en second argument par l'appelant (scripts/import-fdme.mjs, qui la
 * lit directement en `fs` car il tourne avant qu'`astro:content` ne soit
 * disponible). Créer une nouvelle équipe dans le CMS avec ces deux champs
 * renseignés suffit donc à la rendre reconnaissable ici, sans toucher au
 * code -- notamment pour une catégorie jamais vue auparavant (ex. un futur
 * U20) : voir CLAUDE.md pour l'historique (U17F/U18M créées en 2026-2027,
 * split U13 mixte -> U13F/U13M en 2025-2026).
 */

/** N'importe quel âge à un ou deux chiffres précédé de "U" (pas seulement
 * les âges déjà vus au club) : une catégorie jamais rencontrée avant
 * fonctionne dès que la fiche équipe correspondante existe dans le CMS. */
const AGE_PATTERN = /\bU\s?(\d{1,2})\b/i;
const FEMININ_PATTERN = /f[ée]minin/i;
const MASCULIN_PATTERN = /masculin/i;
const COUPE_PATTERN = /\bcoupe\b/i;

/**
 * @typedef {{ slug: string, categorieAge: string, genre: "mixte" | "feminin" | "masculin" }} EquipeCompetition
 *
 * @param {string} competitionText
 * @param {EquipeCompetition[]} equipesCompetition Équipes de compétition
 *   déclarées dans le CMS avec une catégorie d'âge et un genre renseignés.
 * @returns {{ equipeSlug: string | null, typeMatch: "championnat" | "coupe" }}
 */
export function detectEquipe(competitionText, equipesCompetition) {
	const typeMatch = COUPE_PATTERN.test(competitionText) ? "coupe" : "championnat";

	const ageMatch = AGE_PATTERN.exec(competitionText);
	const feminin = FEMININ_PATTERN.test(competitionText);
	const masculin = MASCULIN_PATTERN.test(competitionText);

	// Pas d'âge détecté dans le texte de la compétition : on suppose seniors
	// (aucune autre catégorie adulte n'a de sigle d'âge dans son nom de
	// compétition).
	const categorieAge = ageMatch ? `U${Number(ageMatch[1])}` : "senior";

	const candidats = equipesCompetition.filter((e) => e.categorieAge === categorieAge);
	if (candidats.length === 0) return { equipeSlug: null, typeMatch };

	// U9/U11 sont mixtes dans ce club (et toute autre catégorie mixte future) :
	// le genre détecté dans le texte, le cas échéant, est ignoré.
	const mixte = candidats.find((e) => e.genre === "mixte");
	if (mixte) return { equipeSlug: mixte.slug, typeMatch };

	if (feminin) {
		const match = candidats.find((e) => e.genre === "feminin");
		if (match) return { equipeSlug: match.slug, typeMatch };
	}
	if (masculin) {
		const match = candidats.find((e) => e.genre === "masculin");
		if (match) return { equipeSlug: match.slug, typeMatch };
	}

	// Genre absent/inattendu du texte (ex. une compétition étiquetée "MIXTE"
	// une saison donnée pour une catégorie qui a par ailleurs un vrai féminin
	// et un vrai masculin dans ce club, vu en 2025-2026 pour U13) : ne PAS
	// deviner entre les deux quand plusieurs équipes existent pour cet âge --
	// seule une catégorie n'ayant qu'une équipe possible (ex. U17F, U18M) peut
	// être déduite sans ambiguïté ici.
	if (candidats.length === 1 && !feminin && !masculin) return { equipeSlug: candidats[0].slug, typeMatch };
	return { equipeSlug: null, typeMatch };
}

/** Code FFHandball du club (voir l'e-mail de contact dans CLAUDE.md,
 * 6384006@sud.ffhandball.net) : préfixe des numéros de licence de tous les
 * licencié·e·s du HBI. Signal fiable pour savoir quel camp de la feuille
 * est le HBI, indépendamment de l'orthographe exacte du nom d'équipe
 * ("HANDBALL ISLOIS", "HANDBALL ISLOIS 1"...). */
export const CLUB_CODE = "6384006";
export const CLUB_NAME_PATTERN = /handball\s*islois/i;
