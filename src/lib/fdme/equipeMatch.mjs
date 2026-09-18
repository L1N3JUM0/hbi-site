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
 * fonctionne dès que la fiche équipe correspondante existe dans le CMS.
 * Capture aussi un éventuel genre collé juste après, sans séparateur
 * ("U15M", "U17F" -- vu sur des compétitions régionales, notamment
 * "QUALIFICATIONS EXCELLENCE 2025-2026 - U15M" où c'est le SEUL signal de
 * genre du texte) : exiger une limite de mot juste après le chiffre
 * (`\bU\s?(\d{1,2})\b`) ratait ce cas, "M"/"F" étant lui-même un caractère
 * de mot, donc aucune frontière entre "5" et "M". */
const AGE_PATTERN = /\bU\s?(\d{1,2})\s?([MF])?\b/i;
/** Repli pour les feuilles anciennes (saisons 2021 à 2023 au moins) et
 * certaines compétitions régionales, qui n'utilisent pas la forme "U15"
 * mais "-15 ANS" ou "MOINS DE 15 ANS". */
const AGE_ANS_PATTERN = /(?:-|MOINS DE)\s*(\d{1,2})\s*ANS\b/i;
/** "FILLES"/"GARCONS" (sans cédille, l'export FFHandball n'a pas toujours
 * les accents) : vocabulaire vu sur des compétitions anciennes et
 * régionales ("U13 FILLES 2023-2024", "U13 EXCELLENCE PACA GARCONS"), en
 * plus des mots "féminin"/"masculin" habituels. */
const FEMININ_PATTERN = /f[ée]minin|\bfilles?\b/i;
const MASCULIN_PATTERN = /masculin|\bgar[çc]ons?\b/i;
const COUPE_PATTERN = /\bcoupe\b/i;

/**
 * @typedef {{ url: string, libelle?: string, repere?: string }} CalendrierEquipe
 * @typedef {{ slug: string, categorieAge: string, genre: "mixte" | "feminin" | "masculin", calendriers?: CalendrierEquipe[] }} EquipeCompetition
 *
 * @param {string} competitionText
 * @param {EquipeCompetition[]} equipesCompetition Équipes de compétition
 *   déclarées dans le CMS avec une catégorie d'âge et un genre renseignés.
 * @returns {{ equipeSlug: string | null, typeMatch: "championnat" | "coupe" }}
 */
export function detectEquipe(competitionText, equipesCompetition) {
	const typeMatch = COUPE_PATTERN.test(competitionText) ? "coupe" : "championnat";

	const ageMatch = AGE_PATTERN.exec(competitionText) ?? AGE_ANS_PATTERN.exec(competitionText);
	let feminin = FEMININ_PATTERN.test(competitionText);
	let masculin = MASCULIN_PATTERN.test(competitionText);
	// Repli sur le genre collé juste après l'âge ("U15M", "U17F") quand
	// aucun mot dédié n'est présent par ailleurs -- voir AGE_PATTERN.
	if (!feminin && !masculin && ageMatch?.[2]) {
		feminin = ageMatch[2].toUpperCase() === "F";
		masculin = ageMatch[2].toUpperCase() === "M";
	}

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

/**
 * Vrai si ce texte d'équipe (nom domicile/extérieur brut d'une feuille de
 * match) désigne le HBI -- soit via le nom habituel ("Handball Islois", voir
 * CLUB_NAME_PATTERN ci-dessus), soit via un nom d'ENTENTE avec un autre club
 * déclaré comme `repere` d'un calendrier dans le CMS (ex. "L'Isle - Le Thor"
 * pour l'entente U17F 2026-2027 avec le Handball Club du Thor, dont le nom
 * d'équipe sur les feuilles/flux FFHandball -- "L'ISLE - LE THOR (U17F)" --
 * ne contient ni "Handball" ni "Islois", voir CLAUDE.md et
 * src/content/equipes/u17-feminines.md).
 *
 * On regarde les `repere` de TOUTES les équipes de compétition, pas
 * seulement celle déjà identifiée par `detectEquipe()` : à ce stade du
 * parsing (voir parseFeuille.mjs), on ne sait pas encore quelle équipe a
 * joué, seulement quel camp de la feuille est le HBI. Un `repere` qui vaut
 * encore la valeur par défaut ("Handball Islois", voir content.config.ts)
 * n'apporte aucun signal de plus que CLUB_NAME_PATTERN ; seuls les reperes
 * qui s'en écartent (une vraie entente) sont testés ici.
 *
 * @param {string} nomEquipe
 * @param {EquipeCompetition[]} [equipesCompetition]
 * @returns {boolean}
 */
export function estNomEquipeHBI(nomEquipe, equipesCompetition = []) {
	if (CLUB_NAME_PATTERN.test(nomEquipe)) return true;
	const texte = normaliserTexte(nomEquipe);
	return equipesCompetition.some((e) =>
		(e.calendriers ?? []).some((c) => {
			const repere = c.repere?.trim();
			if (!repere || CLUB_NAME_PATTERN.test(repere)) return false;
			return texte.includes(normaliserTexte(repere));
		}),
	);
}

/** Quand plusieurs équipes du club sont engagées dans la même poule (ex.
 * Seniors masculins 1 et 2), la feuille de match les distingue -- pour la
 * plupart -- par un numéro à la fin du nom d'équipe ("HANDBALL ISLOIS 2").
 * `null` si aucun numéro n'est trouvé : soit une équipe seule dans sa
 * catégorie, soit -- convention FFHandball constatée sur les feuilles
 * réelles -- la première équipe engagée, dont le nom reste "HANDBALL ISLOIS"
 * sans suffixe (vu le 08/11/2025 : la même compétition imprime "HANDBALL
 * ISLOIS" pour l'équipe 1 et "HANDBALL ISLOIS 2" pour l'équipe 2, sur deux
 * feuilles différentes). Ne PAS transformer ce `null` en "1" ici : seul
 * l'appelant sait, en regardant l'ensemble des résultats déjà connus de
 * cette équipe (voir aPlusieursEquipes() dans src/lib/resultats.ts), si "pas
 * de numéro" doit se comprendre comme "équipe 1 implicite" ou comme "pas de
 * partage de poule du tout". */
export function extraireNumeroEquipe(nomEquipeHBI) {
	return /(\d+)\s*$/.exec(nomEquipeHBI.trim())?.[1] ?? null;
}

/** Retire les diacritiques et met en minuscules, pour comparer deux textes
 * sans tenir compte de la casse ni des accents (ex. le libellé "Départementale"
 * saisi dans le CMS doit reconnaître "DEPARTEMENTALE" sur une feuille de
 * match, qui n'a pas toujours les accents). Exportée : réutilisée telle
 * quelle par src/lib/resultats.ts pour regrouper par équipe à l'affichage
 * sans se laisser abuser par une variante de casse/accents du même libellé
 * (ex. "Excellence" vs "excellence" saisis à des moments différents). */
export function normaliserTexte(texte) {
	return texte
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase();
}

/**
 * Cas différent de `extraireNumeroEquipe` ci-dessus : quand plusieurs
 * équipes du club partagent la même catégorie (`categorieAge`+`genre`) mais
 * sont engagées dans des COMPÉTITIONS DIFFÉRENTES -- donc des flux iCal
 * différents, contrairement aux Seniors masculins 1/2 qui partagent la même
 * poule (ex. U15 masculins "Excellence Région" et "Départementale" à partir
 * de la saison 2026-2027). Sur la feuille de match, le nom d'équipe HBI ne
 * porte alors aucun suffixe distinctif dans les deux cas ("HANDBALL
 * ISLOIS") : seul le texte de la compétition permet de savoir laquelle des
 * deux a joué, comparé au `libelle` de chaque calendrier de la fiche équipe
 * (ex. "Excellence", "Départementale" -- voir content.config.ts).
 *
 * N'est PERTINENT que si les calendriers de l'équipe ont des `url`
 * distinctes (donc de vraies compétitions différentes) : à l'appelant de ne
 * pas invoquer cette fonction pour une équipe dont les calendriers
 * partagent la même `url` (partage de poule, cas de `extraireNumeroEquipe`
 * ci-dessus) -- sinon un libellé numérique ("1"/"2") pourrait matcher par
 * coïncidence un numéro de poule dans le texte de la compétition ("POULE
 * 2") et produire un rattachement silencieusement faux.
 *
 * Ne devine JAMAIS en cas de doute (aucun `libelle` ne correspond, ou
 * plusieurs correspondent à la fois) : un rattachement faux serait pire
 * qu'un résultat importé mais non distingué -- voir l'appelant
 * (scripts/import-fdme.mjs), qui signale alors le cas dans le bandeau
 * d'erreurs d'import plutôt que de deviner.
 *
 * @param {string} competitionText
 * @param {CalendrierEquipe[]} calendriers Calendriers de l'équipe déjà
 *   déterminée par `detectEquipe()`.
 * @returns {{ libelle: string | null, ambigu: boolean }} `ambigu` est true
 *   quand une décision existe à prendre (plusieurs calendriers avec un
 *   `libelle` et des compétitions distinctes) mais n'a pas pu être prise
 *   automatiquement -- à distinguer du cas "rien à distinguer" (`libelle`
 *   et `ambigu` tous les deux absents/false), qui n'appelle aucune action.
 */
export function detecterLibelleCompetition(competitionText, calendriers) {
	const candidats = (calendriers ?? []).filter((c) => c.libelle?.trim());
	if (candidats.length < 2) return { libelle: null, ambigu: false };

	const texteNormalise = normaliserTexte(competitionText);
	const correspondances = candidats.filter((c) => texteNormalise.includes(normaliserTexte(c.libelle.trim())));

	if (correspondances.length === 1) return { libelle: correspondances[0].libelle.trim(), ambigu: false };
	return { libelle: null, ambigu: true };
}
