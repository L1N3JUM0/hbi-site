/**
 * Extraction et mise en forme des noms de joueur·se·s depuis une feuille de
 * match FFHandball.
 *
 * Règles (voir CLAUDE.md et la demande initiale) :
 * - le nom de naissance entre parenthèses ("(Né.e FAY)") est retiré et
 *   jamais stocké, même abrégé ;
 * - le numéro de licence n'est jamais extrait ni stocké (fait ailleurs) ;
 * - séparation nom/prénom par la CASSE (nom de famille en MAJUSCULES,
 *   prénom en casse normale) et non par un découpage positionnel ou un
 *   nombre de mots fixe -- les noms composés ("BAYON DE NOYER Nicolas") et
 *   les prénoms composés ("Jean-francois") sont fréquents.
 */

const BIRTH_NAME_PATTERN = /\s*\(\s*n[ée]\.?e?\s+[^)]*\)/gi;

/** Retire "(Né.e XXX)" / "(Née XXX)" partout où ça apparaît. À appliquer
 * avant toute autre analyse du texte "NOM prénom (Nom d'usage)". */
export function stripBirthName(raw) {
	return raw.replace(BIRTH_NAME_PATTERN, "").replace(/\s+/g, " ").trim();
}

function isUppercaseWord(word) {
	const letters = word.replace(/[^\p{L}]/gu, "");
	return letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Sépare "NOM prénom" en {nom, prenom} en se basant sur la casse : tous les
 * mots en tête de chaîne qui sont entièrement en MAJUSCULES forment le nom
 * de famille (gère les noms composés à espaces), le reste forme le prénom
 * (gère les prénoms composés à trait d'union). Suppose que `raw` a déjà été
 * nettoyé via stripBirthName().
 *
 * Renvoie `null` si la chaîne ne contient pas au moins un mot en majuscules
 * suivi d'un mot en casse normale (format inattendu -- à l'appelant de
 * traiter cette rencontre comme non exploitable plutôt que de deviner).
 */
export function splitNomPrenom(raw) {
	const words = raw.trim().split(/\s+/).filter(Boolean);
	let cut = 0;
	while (cut < words.length && isUppercaseWord(words[cut])) cut++;
	if (cut === 0 || cut === words.length) return null;
	return {
		nom: words.slice(0, cut).join(" "),
		prenom: words.slice(cut).join(" "),
	};
}

/** "MAUREL--HERRERA" -> "Maurel-Herrera", "charlie" -> "Charlie", en gérant
 * les espaces, traits d'union et apostrophes comme séparateurs de casse. */
export function formatNomPropre(raw) {
	const normalized = raw.toLowerCase().replace(/-{2,}/g, "-");
	return normalized.replace(/(^|[-'\s])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

/** Label pseudonymisé "de base" : prénom + initiale du nom de famille
 * (ex. "Théo M."). Peut entrer en collision entre deux joueur·se·s d'une
 * même équipe -- voir disambiguateDisplayNames(). */
function baseLabel(prenom, nom, initialLength = 1) {
	const nomFormatted = formatNomPropre(nom);
	// Le nom de famille peut être composé ("Bayon De Noyer") : on ne prend
	// l'initiale que du premier mot, seule variation possible en cas de
	// collision étant sa longueur (voir disambiguateDisplayNames).
	const firstWord = nomFormatted.split(/[\s-]/)[0] ?? nomFormatted;
	const initiales = firstWord.slice(0, initialLength);
	return `${formatNomPropre(prenom)} ${initiales}.`;
}

/**
 * Calcule le libellé d'affichage de chaque joueur·se pour un mode
 * d'affichage donné, en gérant les homonymes.
 *
 * Clé interne stable : le numéro de maillot (`numero`), jamais le libellé
 * affiché -- deux joueur·se·s peuvent produire le même "Lucas M." en mode
 * pseudonymisé, mais leurs stats ne doivent jamais se mélanger. En cas de
 * collision, on étend l'initiale du nom de famille (2 lettres, puis 3...)
 * jusqu'à ce que les libellés du groupe en collision soient uniques ; si
 * deux joueur·se·s ont exactement le même prénom ET le même nom de famille
 * (vrai homonyme, cas limite), on ajoute le numéro de maillot au libellé.
 *
 * @param {{ numero: number, prenom: string, nom: string }[]} joueurs
 * @param {"nominatif" | "pseudonymise" | "masque"} mode
 * @returns {Map<number, string | null>} numero -> libellé affiché (null en mode "masque")
 */
export function disambiguateDisplayNames(joueurs, mode) {
	const result = new Map();

	if (mode === "masque") {
		for (const j of joueurs) result.set(j.numero, null);
		return result;
	}

	if (mode === "nominatif") {
		for (const j of joueurs) result.set(j.numero, `${formatNomPropre(j.prenom)} ${formatNomPropre(j.nom)}`);
		return result;
	}

	// mode "pseudonymise" : regrouper par label de base, puis étendre
	// l'initiale au sein de chaque groupe en collision.
	let initialLength = 1;
	let pending = joueurs;
	while (pending.length > 0 && initialLength <= 20) {
		const groups = new Map();
		for (const j of pending) {
			const label = baseLabel(j.prenom, j.nom, initialLength);
			if (!groups.has(label)) groups.set(label, []);
			groups.get(label).push(j);
		}
		const stillColliding = [];
		for (const [label, group] of groups) {
			if (group.length === 1) {
				result.set(group[0].numero, label);
			} else {
				// Homonymes vrais (prénom + nom identiques) : rien à gagner à
				// allonger l'initiale, on distingue par numéro de maillot.
				const trueHomonyms = group.every(
					(j) => formatNomPropre(j.prenom) === formatNomPropre(group[0].prenom) && formatNomPropre(j.nom) === formatNomPropre(group[0].nom),
				);
				if (trueHomonyms) {
					for (const j of group) result.set(j.numero, `${label} (n°${j.numero})`);
				} else {
					stillColliding.push(...group);
				}
			}
		}
		pending = stillColliding;
		initialLength++;
	}
	// Filet de sécurité si la boucle ci-dessus n'a pas convergé (ne devrait
	// pas arriver avec des noms de famille réels) : numéro de maillot.
	for (const j of pending) result.set(j.numero, `${baseLabel(j.prenom, j.nom)} (n°${j.numero})`);

	return result;
}
