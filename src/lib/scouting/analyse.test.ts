// Lancer : npm test (node:test, sans dépendance supplémentaire).
import { test } from "node:test";
import assert from "node:assert/strict";
import { cumulerButeurs, journeesALire, libellesJoueurs, lireUrlRencontre, matchAller, matchsJoues, moyennes } from "./analyse.mjs";

// Extraits réels de la poule Division 1 masculins 2026-2027 (192119).
const r = (id: string, date: string | null, e1: string, s1: string | null, s2: string | null, e2: string, j = "1") => ({
	ext_rencontreId: id,
	date,
	journeeNumero: j,
	equipe1Id: e1,
	equipe2Id: e2,
	equipe1Libelle: e1,
	equipe2Libelle: e2,
	equipe1Score: s1,
	equipe2Score: s2,
});
const HBI1 = "islois1";
const ADV = "carpentras";
const rencontres = [
	r("1", "2026-09-13T11:00:00+02:00", "islois2", "FO", "20", ADV),
	r("2", "2026-09-19T20:30:00+02:00", ADV, "18", "35", HBI1, "2"),
	r("3", "2026-10-10T20:00:00+02:00", ADV, "31", "17", "bollene", "4"),
	r("4", "2026-11-07T19:30:00+01:00", "orange", null, null, ADV, "5"),
	r("5", null, "x", null, null, "y", "3"),
	r("6", "2027-02-06T20:00:00+01:00", HBI1, null, null, ADV, "12"),
];

test("forme : plus récent d'abord, matchs non joués ignorés, forfait sans score", () => {
	const joues = matchsJoues([...rencontres, rencontres[2]], ADV);
	assert.deepEqual(
		joues.map((m) => [m.rencontreId, m.resultat, m.butsPour, m.butsContre, m.forfait]),
		[
			["3", "V", 31, 17, false],
			["2", "D", 18, 35, false],
			["1", "V", 20, null, true],
		],
	);
});

test("moyennes hors forfaits, null sans match", () => {
	assert.deepEqual(moyennes(matchsJoues(rencontres, ADV)), { marques: 24.5, encaisses: 26, matchs: 2 });
	assert.equal(moyennes([]), null);
});

test("match aller vu par le HBI, jamais le match à venir", () => {
	const aller = matchAller(rencontres, HBI1, ADV, "6");
	assert.equal(aller?.rencontreId, "2");
	assert.equal(aller?.resultat, "V");
	assert.equal(aller?.butsPour, 35);
	assert.equal(matchAller(rencontres, "islois2", "bollene", "6"), null);
});

test("buteurs : cumul, partiel si la somme ne fait pas le score ou si une feuille manque", () => {
	const m = (butsPour: number) => ({ match: { butsPour } });
	const j = (equipeId: string, nom: string, buts: string) => ({ equipeId, nom, prenom: "X", buts });
	const complet = cumulerButeurs(
		[
			{ ...m(5), joueurs: [j(ADV, "A", "3"), j(ADV, "B", "2"), j("autre", "C", "9")] },
			{ ...m(4), joueurs: [j(ADV, "B", "4"), j(ADV, "A", "0")] },
		],
		ADV,
	);
	assert.deepEqual(complet?.liste.map((l) => [l.nom, l.buts, l.matchs]), [["B", 6, 2], ["A", 3, 2]]);
	assert.equal(complet?.partiel, false);
	assert.equal(cumulerButeurs([{ ...m(19), joueurs: [j(ADV, "A", "8")] }], ADV)?.partiel, true);
	assert.equal(cumulerButeurs([{ ...m(5), joueurs: [j(ADV, "A", "5")] }, { ...m(3), joueurs: null }], ADV)?.partiel, true);
	assert.equal(cumulerButeurs([{ ...m(3), joueurs: null }], ADV), null);
});

test("noms : complet pour les seniors, prénom + initiale sinon, sans collision", () => {
	const joueurs = [
		{ nom: "BAYON DE NOYER", prenom: "NICOLAS" },
		{ nom: "BERNARD", prenom: "NICOLAS" },
		{ nom: "ULRYCH", prenom: "JEAN-FRANCOIS" },
	];
	assert.deepEqual(libellesJoueurs(joueurs, true), ["Nicolas BAYON DE NOYER", "Nicolas BERNARD", "Jean-Francois ULRYCH"]);
	assert.deepEqual(libellesJoueurs(joueurs, false), ["Nicolas Ba.", "Nicolas Be.", "Jean-Francois U."]);
});

test("URL de rencontre du flux iCal, journées à lire", () => {
	assert.deepEqual(lireUrlRencontre("https://www.ffhandball.fr/competitions/saison-2026-2027-22/departemental/u18-masculin-inter-dep-33194/poule-196031/rencontre-2716470/"), {
		pouleBase: "https://www.ffhandball.fr/competitions/saison-2026-2027-22/departemental/u18-masculin-inter-dep-33194/poule-196031",
		rencontreId: "2716470",
	});
	assert.equal(lireUrlRencontre("https://exemple.fr/rencontre-1/"), null);
	const journees = [
		{ journee_numero: 1, date_debut: "2026-09-12" },
		{ journee_numero: 2, date_debut: "2026-10-10" },
		{ journee_numero: 3, date_debut: "2026-11-07" },
	];
	assert.deepEqual(journeesALire(journees, "2026-10-17", [3, null]), [1, 2, 3]);
	assert.deepEqual(journeesALire(journees, "2026-10-17", []), [1, 2]);
});

test("coupe : comité, catégorie, équipe du club dans un flux iCal", async () => {
	const { segmentComite, estCompetitionDeCategorie, equipesDuClub, choisirEquipe, idEquipeDansRencontre } = await import("./analyse.mjs");
	assert.equal(segmentComite("COMITE DES BOUCHES DU RHONE", "43"), "o-comite-des-bouches-du-rhone-43");
	assert.equal(segmentComite("COMITE DES ALPES-MARITIMES", "155"), "o-comite-des-alpes-maritimes-155");

	const c = (libelle: string, genre = "MASCULIN") => ({ libelle, genre });
	assert.equal(estCompetitionDeCategorie(c("1ERE DIVISION MASCULINE TERRITORIALE"), "MASCULIN", "senior"), true);
	assert.equal(estCompetitionDeCategorie(c("DIVISION 1 FEMININES", "FEMININ"), "MASCULIN", "senior"), false);
	assert.equal(estCompetitionDeCategorie(c("U18 MASCULINS DEPARTEMENTALE"), "MASCULIN", "senior"), false);
	assert.equal(estCompetitionDeCategorie(c("U18 MASCULINS DEPARTEMENTALE"), "MASCULIN", "U18"), true);
	assert.equal(estCompetitionDeCategorie(c("PLATEAU U9 MIXTES", "MIXTE"), "", "senior"), false);

	const ev = (titre: string) => ({ titre });
	assert.deepEqual(
		equipesDuClub([ev("EP MANOSQUE 04 HB vs MALLEMORT DURANCE PROVENCE HB"), ev("MALLEMORT DURANCE PROVENCE HB vs MARSEILLE NORD HANDBALL")]),
		["MALLEMORT DURANCE PROVENCE HB"],
	);
	assert.deepEqual(equipesDuClub([ev("X 1 vs A"), ev("B vs X 2"), ev("X 1 vs C"), ev("X 2 vs D")]).sort(), ["X 1", "X 2"]);

	const candidats = [
		{ equipe: "MALLEMORT HB 2", competition: "D2" },
		{ equipe: "MALLEMORT HB 1", competition: "D1" },
	];
	assert.equal(choisirEquipe(candidats, "MALLEMORT HB")?.competition, "D1");
	assert.equal(choisirEquipe(candidats, "MALLEMORT HB 2")?.competition, "D2");
	assert.equal(choisirEquipe([], "X"), null);

	const r = { equipe1Id: "1", equipe2Id: "2", equipe1Libelle: "A", equipe2Libelle: "MALLEMORT  HB " };
	assert.equal(idEquipeDansRencontre(r, "mallemort hb"), "2");
	assert.equal(idEquipeDansRencontre(r, "Z"), null);
});
