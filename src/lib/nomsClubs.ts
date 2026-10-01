/**
 * Noms d'adversaires : le flux iCal et les feuilles de match FFHandball les
 * donnent en MAJUSCULES ("PAYS D'APT HANDBALL"). À l'affichage seulement --
 * les données ne sont jamais modifiées, elles servent aussi au rapprochement
 * flux/résultats/reports (voir memeAdversaire()) -- on les remet en casse
 * normale ("Pays d'Apt Handball") en gardant les sigles ("HBC", "CO").
 */

/** Sigles courants des noms de clubs : restent en majuscules. La règle "pas
 * de voyelle" (voir plus bas) couvre déjà HBC, HB, SMHB... ; cette liste sert
 * aux sigles qui contiennent une voyelle. Pas de règle "3 lettres = sigle" :
 * Apt et Gap sont des villes. */
const SIGLES = new Set([
	"AC", "AL", "AS", "ASC", "ASL", "ASM", "ASPTT", "CA", "CO", "CS", "CSL", "EP", "ES", "ESL",
	"HAC", "OC", "OM", "PAUC", "RC", "SA", "SC", "UMS", "US", "USA", "UST", "ASU", "AUC",
]);

/** Toujours en minuscules hors début de nom. */
const PARTICULES = new Set(["d", "de", "du", "des", "sur", "sous", "en", "et", "aux", "au", "lès"]);
/** "le", "la", "les" : minuscules seulement dans un nom composé
 * ("Isle-sur-la-Sorgue", "sur la Sorgue") -- pas devant un nom de lieu ("Le
 * Thor", "La Ciotat", "Aix - Les Milles"). */
const ARTICLES = new Set(["le", "la", "les"]);

const VOYELLE = /[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜŸ]/i;

function capitaliser(mot: string): string {
	return mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase();
}

export function casseNomClub(nom: string | null | undefined): string {
	const texte = (nom ?? "").trim();
	// Déjà en casse mixte (saisi à la main dans le CMS, ex. un match reporté) :
	// on respecte la saisie.
	if (!texte || /[a-zà-ÿ]/.test(texte)) return texte;

	const morceaux = texte.split(/([A-Za-zÀ-ÿ0-9]+)/);
	let premier = true;
	let precedent = "";
	return morceaux
		.map((morceau, i) => {
			// Les indices impairs sont les mots, les pairs les séparateurs.
			if (i % 2 === 0) return morceau;
			const separateur = morceaux[i - 1] ?? "";
			const bas = morceau.toLowerCase();
			let sortie: string;
			if (/^\d/.test(morceau) || /^U\d+[MF]?$/.test(morceau) || /^(II|III|IV)$/.test(morceau)) {
				sortie = morceau;
			} else if (SIGLES.has(morceau) || (morceau.length >= 2 && !VOYELLE.test(morceau))) {
				sortie = morceau;
			} else if (!premier && PARTICULES.has(bas)) {
				sortie = bas;
			} else if (!premier && ARTICLES.has(bas) && (separateur === "-" || PARTICULES.has(precedent))) {
				sortie = bas;
			} else {
				sortie = capitaliser(morceau);
			}
			premier = false;
			precedent = sortie;
			return sortie;
		})
		.join("");
}
