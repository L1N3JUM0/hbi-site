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

// --- Coupe : retrouver le championnat d'un adversaire hors de nos poules ---

/** Segment d'URL d'un comité sur ffhandball.fr, même règle que le site
 * fédéral (`o-` + libellé en minuscules sans accents + identifiant) :
 * "COMITE DES BOUCHES DU RHONE", "43" -> "o-comite-des-bouches-du-rhone-43". */
export function segmentComite(libelle, extStructureId) {
	const texte = libelle
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `o-${texte}-${extStructureId}`;
}

/** Une compétition départementale est-elle de la bonne catégorie ? Seniors :
 * tout ce qui ne porte pas de catégorie d'âge ("1ERE DIVISION MASCULINE
 * TERRITORIALE", "DIVISION 1 FEMININES") ; jeunes : la catégorie dans le
 * libellé ("U17 FEMININES INTER DEP POULE 1"). Loisirs et plateaux exclus. */
export function estCompetitionDeCategorie(competition, genre, categorieAge) {
	if (genre && competition.genre && competition.genre !== genre) return false;
	const libelle = competition.libelle ?? "";
	if (/plateau|loisir|baby|non\s+competiti/i.test(libelle)) return false;
	if (categorieAge === "senior") return !/\b(U|-)\s?\d{2}\b|moins\s+de/i.test(libelle);
	return new RegExp(`\\b${categorieAge}\\b`, "i").test(libelle);
}

const normaliser = (nom) => (nom ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/** Nom(s) d'équipe du club dans un flux iCal "compétition × club" : celui
 * qui figure dans TOUS les matchs du flux (l'adversaire change, pas lui).
 * Plusieurs noms si le club y engage plusieurs équipes ("X 1" et "X 2"
 * jouent toujours, mais pas dans les mêmes matchs : aucun n'est commun),
 * d'où le repli sur les noms présents dans au moins la moitié des matchs. */
export function equipesDuClub(evenements) {
	const camps = evenements.map((e) => e.titre.split(/\s+vs\s+/i).map(normaliser)).filter((c) => c.length === 2);
	if (camps.length === 0) return [];
	const compte = new Map();
	for (const c of camps) for (const nom of new Set(c)) compte.set(nom, (compte.get(nom) ?? 0) + 1);
	const communs = [...compte].filter(([, n]) => n === camps.length).map(([nom]) => nom);
	if (communs.length) return communs;
	return [...compte].filter(([, n]) => n * 2 >= camps.length).sort((a, b) => b[1] - a[1]).map(([nom]) => nom);
}

/** Parmi les équipes trouvées (dans l'ordre des compétitions du comité,
 * division la plus haute d'abord), celle qui joue la coupe : même nom
 * exact, sinon la "1", sinon la première. */
export function choisirEquipe(candidats, nomCoupe) {
	const cible = normaliser(nomCoupe).replace(/\s+\d+$/, "");
	return (
		candidats.find((c) => normaliser(c.equipe) === normaliser(nomCoupe)) ??
		candidats.find((c) => normaliser(c.equipe) === `${cible} 1`) ??
		candidats.find((c) => normaliser(c.equipe).startsWith(cible)) ??
		candidats[0] ??
		null
	);
}

/** Identifiant fédéral d'une équipe dans une rencontre, d'après son nom. */
export function idEquipeDansRencontre(rencontre, nomEquipe) {
	const cible = normaliser(nomEquipe);
	if (normaliser(rencontre.equipe1Libelle) === cible) return rencontre.equipe1Id;
	if (normaliser(rencontre.equipe2Libelle) === cible) return rencontre.equipe2Id;
	return null;
}
