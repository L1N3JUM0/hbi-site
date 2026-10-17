/**
 * Logique pure (sans réseau ni fichier) des fiches de scouting -- voir
 * scripts/scouting-ffhandball.mjs pour la récupération des pages
 * ffhandball.fr. Séparée pour être testable seule sur des données réelles
 * enregistrées (voir analyse.test.ts).
 *
 * Toutes les rencontres manipulées ici ont la forme du composant
 * `competitions---rencontre-list` de ffhandball.fr : `equipe1` reçoit,
 * `equipe2` se déplace, les scores sont des chaînes ("27", "FO" pour un
 * forfait, null pour un match non joué).
 */
import { formatNomPropre } from "../fdme/noms.mjs";

/** "27" -> 27, "FO" -> "FO", tout le reste (null, "", marque inconnue) -> null. */
export function lireScore(valeur) {
	if (typeof valeur === "string" && /^\d+$/.test(valeur)) return Number(valeur);
	if (valeur === "FO") return "FO";
	return null;
}

/**
 * Le match vu par l'équipe `equipeId`, ou null s'il n'est pas exploitable
 * (pas joué, équipe absente, double forfait ou marque inconnue -- jamais
 * deviné, même règle que etatDuMatch() de la récupération des feuilles).
 */
export function matchVuPar(rencontre, equipeId) {
	const domicile = rencontre.equipe1Id === equipeId;
	if (!domicile && rencontre.equipe2Id !== equipeId) return null;
	const s1 = lireScore(rencontre.equipe1Score);
	const s2 = lireScore(rencontre.equipe2Score);
	if (s1 == null || s2 == null || (s1 === "FO" && s2 === "FO")) return null;
	const pour = domicile ? s1 : s2;
	const contre = domicile ? s2 : s1;
	const base = {
		rencontreId: rencontre.ext_rencontreId,
		date: rencontre.date ?? null,
		journee: rencontre.journeeNumero ? Number(rencontre.journeeNumero) : null,
		domicile,
		adversaireId: domicile ? rencontre.equipe2Id : rencontre.equipe1Id,
		adversaire: domicile ? rencontre.equipe2Libelle : rencontre.equipe1Libelle,
	};
	if (pour === "FO" || contre === "FO") {
		// Le score affiché en face du forfait est conventionnel (souvent 20) :
		// on le garde pour l'affichage, jamais pour les moyennes.
		return { ...base, forfait: true, resultat: pour === "FO" ? "D" : "V", butsPour: pour === "FO" ? null : pour, butsContre: contre === "FO" ? null : contre };
	}
	return { ...base, forfait: false, resultat: pour > contre ? "V" : pour < contre ? "D" : "N", butsPour: pour, butsContre: contre };
}

/** Une même rencontre apparaît une seule fois par journée, mais un match
 * reporté peut être relu sur deux pages : dédoublonnage par identifiant. */
export function dedoublonner(rencontres) {
	return [...new Map(rencontres.map((r) => [r.ext_rencontreId, r])).values()];
}

/** Matchs joués par `equipeId`, du plus récent au plus ancien. Un match
 * sans date (jamais vu joué, mais par prudence) passe en dernier. */
export function matchsJoues(rencontres, equipeId) {
	return dedoublonner(rencontres)
		.map((r) => matchVuPar(r, equipeId))
		.filter(Boolean)
		.sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
}

/** Moyennes par match, hors forfaits (score conventionnel). */
export function moyennes(matchs) {
	const joues = matchs.filter((m) => !m.forfait);
	if (joues.length === 0) return null;
	const arrondi = (n) => Math.round((n / joues.length) * 10) / 10;
	return {
		marques: arrondi(joues.reduce((s, m) => s + m.butsPour, 0)),
		encaisses: arrondi(joues.reduce((s, m) => s + m.butsContre, 0)),
		matchs: joues.length,
	};
}

/** Dernière rencontre déjà jouée entre les deux équipes, vue par le HBI,
 * hors le match à venir lui-même. */
export function matchAller(rencontres, hbiId, adversaireId, rencontreAVenirId) {
	return matchsJoues(rencontres, hbiId).find((m) => m.adversaireId === adversaireId && m.rencontreId !== rencontreAVenirId) ?? null;
}

/** Ligne de classement de l'équipe, ou null. */
export function ligneClassement(classement, equipeId) {
	const ligne = classement.find((c) => c.equipeId === equipeId);
	if (!ligne) return null;
	const n = (v) => Number(v);
	return {
		place: n(ligne.place),
		points: n(ligne.point),
		joue: n(ligne.joue),
		gagne: n(ligne.gagne),
		nul: n(ligne.nul),
		perdu: n(ligne.perdu),
		butPlus: n(ligne.butPlus),
		butMoins: n(ligne.butMoins),
		diff: n(ligne.diff),
		nbEquipes: classement.length,
	};
}

/**
 * Cumule les buts des joueur·se·s de `equipeId` sur les feuilles fournies.
 * La page fédérale omet les joueur·se·s sans numéro de licence (constaté
 * le 17/10/2026, voir le rapport d'exploration) : quand la somme des buts
 * listés ne fait pas le score, le classement est marqué `partiel`.
 *
 * @param {{ match: { butsPour: number }, joueurs: { equipeId: string, nom: string, prenom: string, buts: string }[] | null }[]} feuilles
 *   `joueurs` à null : page indisponible pour ce match.
 */
export function cumulerButeurs(feuilles, equipeId) {
	const cumul = new Map();
	let partiel = false;
	let analyses = 0;
	for (const { match, joueurs } of feuilles) {
		if (!joueurs) {
			partiel = true;
			continue;
		}
		analyses++;
		let somme = 0;
		for (const j of joueurs) {
			if (j.equipeId !== equipeId) continue;
			const buts = Number(j.buts) || 0;
			somme += buts;
			const cle = `${j.nom}|${j.prenom}`;
			const ligne = cumul.get(cle) ?? { nom: j.nom ?? "", prenom: j.prenom ?? "", buts: 0, matchs: 0 };
			ligne.buts += buts;
			ligne.matchs++;
			cumul.set(cle, ligne);
		}
		if (somme !== match.butsPour) partiel = true;
	}
	if (analyses === 0) return null;
	const liste = [...cumul.values()].filter((l) => l.buts > 0).sort((a, b) => b.buts - a.buts || a.nom.localeCompare(b.nom));
	return { liste, matchsAnalyses: analyses, matchsDemandes: feuilles.length, partiel };
}

/**
 * Libellés affichés. Nom complet pour les seniors ; prénom + initiale du
 * nom pour les catégories jeunes (mineur·e·s), initiale allongée en cas de
 * collision dans la liste -- même principe que disambiguateDisplayNames()
 * (fdme/noms.mjs), qui ne s'applique pas ici : il s'appuie sur le numéro de
 * maillot, qui varie d'un match à l'autre chez un adversaire.
 *
 * @param {{ nom: string, prenom: string }[]} joueurs
 * @param {boolean} nomComplet
 * @returns {string[]} dans le même ordre que `joueurs`
 */
export function libellesJoueurs(joueurs, nomComplet) {
	if (nomComplet) return joueurs.map((j) => `${formatNomPropre(j.prenom)} ${j.nom.toUpperCase()}`.trim());
	const premierMot = (nom) => formatNomPropre(nom).split(/[\s-]/)[0] ?? "";
	const libelle = (j, longueur) => `${formatNomPropre(j.prenom)} ${premierMot(j.nom).slice(0, longueur)}.`;
	const longueurs = joueurs.map(() => 1);
	for (let essai = 0; essai < 10; essai++) {
		const libelles = joueurs.map((j, i) => libelle(j, longueurs[i]));
		const compte = new Map();
		for (const l of libelles) compte.set(l, (compte.get(l) ?? 0) + 1);
		const enCollision = libelles.map((l) => compte.get(l) > 1);
		if (!enCollision.includes(true)) return libelles;
		enCollision.forEach((c, i) => {
			if (c) longueurs[i]++;
		});
	}
	return joueurs.map((j, i) => libelle(j, longueurs[i]));
}

/** Rencontre FFHandball depuis l'URL d'un événement du flux iCal :
 * ".../poule-196031/rencontre-2716470/" -> base de la poule + identifiant. */
export function lireUrlRencontre(url) {
	const m = /^(https:\/\/www\.ffhandball\.fr\/competitions\/.+\/poule-\d+)\/rencontre-(\d+)\/?/.exec(url ?? "");
	return m ? { pouleBase: m[1], rencontreId: m[2] } : null;
}

/** Journées à lire : toutes celles déjà commencées, plus celle du match à
 * venir (pour y retrouver la rencontre et les identifiants d'équipe). */
export function journeesALire(journees, aujourdhui, journeesAVenir) {
	const numeros = new Set(journeesAVenir.filter(Boolean));
	for (const j of journees) if (j.date_debut <= aujourdhui) numeros.add(j.journee_numero);
	return [...numeros].sort((a, b) => a - b);
}
