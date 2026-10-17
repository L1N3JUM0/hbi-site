#!/usr/bin/env node
/**
 * Données des pages de scouting réservées aux coachs : Seniors, U18, U17
 * (demande du 17/10/2026), U15 et U13 (ajoutées le même jour). Dernier maillon de
 * "prebuild" avant la vérification des images.
 *
 * Pour chaque calendrier d'une équipe du club de ces catégories :
 * 1. son prochain match d'après le flux iCal FFHandball déjà renseigné dans
 *    sa fiche (`calendriers[].url`) -- l'URL de l'événement donne la poule
 *    et l'identifiant de la rencontre ;
 * 2. la poule sur ffhandball.fr : classement + résultats journée par
 *    journée (JSON injecté dans le HTML, même extraction que
 *    import-stats-ffhandball.mjs) -- la rencontre à venir y donne
 *    l'identifiant fédéral de l'adversaire, sans comparer de noms ;
 * 3. la page de ses 5 derniers matchs, pour les buteurs.
 *
 * Coupe (demande du 17/10/2026) : l'adversaire n'est pas dans nos poules,
 * et son identifiant d'équipe de coupe ne mène pas à son championnat. On
 * part de son identifiant de CLUB (page de la rencontre de coupe), puis on
 * cherche son équipe dans les championnats départementaux des comités de
 * la ligue (règle du club : un adversaire de coupe joue toujours en
 * départementale de son département) via le flux iCal "compétition × club"
 * de la fédération -- voir trouverChampionnat(). Introuvable -> fiche
 * « données indisponibles », jamais devinée.
 *
 * Écrit un JSON par catégorie dans src/data/scouting/, dossier ignoré par
 * git (noms de joueur·se·s adverses, jamais commités) et régénéré à chaque
 * build. Jamais d'échec de build : une donnée manquante est écrite `null`
 * et la page affiche « données indisponibles » ; après une erreur réseau
 * ou une limite de débit (429), plus aucune requête pour ce build.
 *
 * Ne fait RIEN si SCOUTING_SLUG est absent (les pages ne sont alors pas
 * générées, voir src/pages/[scouting]/). Ne jamais afficher ce slug dans
 * les logs : ceux de GitHub Actions peuvent être publics.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireFrontmatter } from "./frontmatter.mjs";
import { equipeDepuisCalendrier, extraireComposant, lireCalendrier } from "../src/lib/fdme/recuperation.mjs";
import {
	choisirEquipe,
	cumulerButeurs,
	equipesDuClub,
	estCompetitionDeCategorie,
	idEquipeDansRencontre,
	journeesALire,
	libellesJoueurs,
	ligneClassement,
	lireUrlRencontre,
	matchAller,
	matchsJoues,
	moyennes,
	segmentComite,
} from "../src/lib/scouting/analyse.mjs";

const EQUIPES_DIR = "src/content/equipes";
const SCOUTING_DIR = "src/data/scouting";
const FFH = "https://www.ffhandball.fr";
/** Comité du club sur ffhandball.fr (Vaucluse) : sa ligue délimite les
 * comités où chercher un adversaire de coupe, et il est essayé en premier. */
const COMITE_HBI = "114";
/** Catégories couvertes, par `categorieAge` de la fiche
 * équipe. `nomComplet` : seuls les seniors (majeur·e·s) sont nommé·e·s en
 * entier, prénom + initiale pour les jeunes. */
const CATEGORIES = [
	{ id: "seniors", libelle: "Seniors", categorieAge: "senior", nomComplet: true },
	{ id: "u17", libelle: "U17", categorieAge: "U17", nomComplet: false },
	{ id: "u18", libelle: "U18", categorieAge: "U18", nomComplet: false },
	{ id: "u15", libelle: "U15", categorieAge: "U15", nomComplet: false },
	{ id: "u13", libelle: "U13", categorieAge: "U13", nomComplet: false },
];
const GENRE_FFH = { masculin: "MASCULIN", feminin: "FEMININ" };
const NB_MATCHS_FORME = 5;
const NB_BUTEURS = 8;
/** Même politesse que les autres imports : pause entre deux requêtes, et
 * plafond par build pour ne jamais bombarder le site de la fédération (la
 * recherche d'un adversaire de coupe coûte jusqu'à ~30 requêtes). */
const PAUSE_MS = 1500;
const MAX_REQUETES = 220;
const UA = { "User-Agent": "Mozilla/5.0 (compatible; hbi-site-import/1.0)" };

const log = (m) => console.log(`[scouting] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const slug = process.env.SCOUTING_SLUG ?? "";
if (!slug) {
	log("SCOUTING_SLUG absent : rien à générer.");
	process.exit(0);
}

/** Même instant de référence que le reste du site (src/lib/agenda.ts). */
function maintenant() {
	const simule = process.env.HBI_MAINTENANT ? new Date(process.env.HBI_MAINTENANT) : null;
	return simule && !Number.isNaN(simule.getTime()) ? simule : new Date();
}
const jourParis = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
const saisonUrl = () => {
	// Même bascule au 1er juillet que src/lib/fdme/saison.mjs ; identifiant
	// fédéral de saison = année de début - 2004 (2026-2027 -> 22).
	const [annee, mois] = jourParis(maintenant()).split("-").map(Number);
	const debut = mois >= 7 ? annee : annee - 1;
	return `${FFH}/competitions/saison-${debut}-${debut + 1}-${debut - 2004}`;
};

class ArretPourCeBuild extends Error {}
let arret = null;
let requetes = 0;

async function lirePage(url) {
	if (arret) throw arret;
	if (requetes >= MAX_REQUETES) throw (arret = new ArretPourCeBuild(`plafond de ${MAX_REQUETES} requêtes atteint`));
	if (requetes > 0) await sleep(PAUSE_MS);
	requetes++;
	let res;
	try {
		res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
	} catch (e) {
		throw (arret = new ArretPourCeBuild(`réseau indisponible (${e.message})`));
	}
	if (res.status === 429 || res.status >= 500) throw (arret = new ArretPourCeBuild(`HTTP ${res.status}`));
	if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
	return res.text();
}

const memo = new Map();
/** Une page n'est lue qu'une fois par build (SM1 et SM2 partagent leur
 * poule, et parfois un adversaire). Les échecs sont mémorisés aussi. */
function unique(cle, lire) {
	if (!memo.has(cle)) memo.set(cle, lire());
	return memo.get(cle);
}

const lireIcs = (url) => unique(`ics:${url}`, async () => lireCalendrier(await lirePage(url)));
const lireComposant = (url, nom) => unique(`page:${url}`, () => lirePage(url)).then((html) => extraireComposant(html, nom));

/** Accueil d'une poule (calendrier des journées, journée en cours) et
 * classement, lus une fois. */
const accueilPoule = (base) =>
	unique(`poule:${base}`, async () => {
		const accueil = await lirePage(`${base}/`);
		const selecteur = extraireComposant(accueil, "competitions---journee-selector");
		let classement = null;
		try {
			classement = (await lireComposant(`${base}/classements/`, "competitions---classement"))?.classements ?? null;
		} catch (e) {
			if (e instanceof ArretPourCeBuild) throw e;
		}
		return {
			journees: JSON.parse(selecteur?.poule?.journees ?? "[]"),
			selection: Number(selecteur?.selected_numero_journee),
			rencontresSelection: extraireComposant(accueil, "competitions---rencontre-list")?.rencontres ?? [],
			classement,
		};
	});

/** Classement + rencontres d'une poule : toutes les journées commencées,
 * plus `journeesAVenir` (celle du match à scouter). Chaque journée n'est lue
 * qu'une fois même si deux équipes du club demandent des journées
 * différentes de la même poule. Une journée illisible est simplement
 * manquante (forme et moyennes calculées sur ce qui reste). */
async function lirePoule(base, journeesAVenir) {
	const accueil = await accueilPoule(base);
	const rencontres = [...accueil.rencontresSelection];
	let journeesManquantes = 0;
	for (const n of journeesALire(accueil.journees, jourParis(maintenant()), journeesAVenir)) {
		if (n === accueil.selection) continue;
		try {
			const liste = await lireComposant(`${base}/journee-${n}/`, "competitions---rencontre-list");
			if (!liste) throw new Error("format inattendu");
			rencontres.push(...(liste.rencontres ?? []));
		} catch (e) {
			if (e instanceof ArretPourCeBuild) throw e;
			journeesManquantes++;
		}
	}
	return { rencontres, classement: accueil.classement, journeesManquantes };
}

/** Buteurs d'une rencontre ; MASQUE quand la fédération choisit de ne pas
 * les afficher (`hideButs`, constaté en U13 le 17/10/2026). Les chiffres
 * restent présents dans le JSON de la page, mais on respecte ce choix :
 * jamais lus, jamais écrits. */
const MASQUE = Symbol("buteurs masqués");
const lireFeuille = async (base, rencontreId) => {
	const liste = await lireComposant(`${base}/rencontre-${rencontreId}/`, "competitions---rencontre-liste-joueurs");
	if (liste?.hideButs) return MASQUE;
	return liste?.statsJoueurs ?? null;
};

/** Comités de la ligue du club, celui du département `departement` (s'il
 * est connu) d'abord, puis celui du club, puis les autres. */
async function comitesDeLaLigue(departement) {
	const menu = await lireComposant(`${saisonUrl()}/departemental/`, "competitions---competition-main-menu");
	const structures = menu?.structures ?? [];
	const ligue = structures.find((s) => s.ext_structureId === COMITE_HBI)?.ligueLibelle;
	if (!ligue) throw new Error("liste des comités illisible");
	const rang = (s) => (departement && s.libelleCourt?.startsWith(`${departement}-`) ? 0 : s.ext_structureId === COMITE_HBI ? 1 : 2);
	return structures.filter((s) => s.ligueLibelle === ligue).sort((a, b) => rang(a) - rang(b));
}

/**
 * Équipe de championnat départemental d'un club adverse de coupe. Parcourt
 * les compétitions de la bonne catégorie de chaque comité de la ligue et
 * interroge le flux iCal "compétition × club" ; s'arrête au premier comité
 * où le club joue (division la plus haute d'abord, voir choisirEquipe()).
 * @returns {Promise<{ equipe: string, competition: string, evenement: object } | null>}
 */
async function trouverChampionnat(structureId, nomCoupe, genre, categorieAge, departement) {
	for (const comite of await comitesDeLaLigue(departement)) {
		const menu = await lireComposant(`${saisonUrl()}/departemental/${segmentComite(comite.libelle, comite.ext_structureId)}/`, "competitions---competition-main-menu");
		const candidats = [];
		for (const competition of (menu?.competitions ?? []).filter((c) => estCompetitionDeCategorie(c, genre, categorieAge))) {
			let evenements = [];
			try {
				evenements = await lireIcs(`https://competition-calendar.ffhandball.fr/c-${competition.ext_competitionId}/s-${structureId}.ics`);
			} catch (e) {
				if (e instanceof ArretPourCeBuild) throw e;
			}
			for (const equipe of equipesDuClub(evenements)) {
				const evenement = evenements.find((e) => e.url && lireUrlRencontre(e.url) && camps(e.titre).includes(equipe));
				if (evenement) candidats.push({ equipe, competition: competition.libelle, comite: comite.libelleCourt, evenement });
			}
		}
		if (candidats.length) return choisirEquipe(candidats, nomCoupe);
	}
	return null;
}

const camps = (titre) => titre.split(/\s+vs\s+/i).map((c) => c.toUpperCase().replace(/\s+/g, " ").trim());

/** Équipes du club d'une catégorie : une entrée par calendrier (SM1 et SM2
 * séparément ; la coupe, qui réunit toute la catégorie, à part). */
function equipesDeCategorie(categorieAge) {
	if (!existsSync(EQUIPES_DIR)) return [];
	return readdirSync(EQUIPES_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((f) => lireFrontmatter(join(EQUIPES_DIR, f)))
		.filter((e) => e.slug && e.type === "competition" && e.statut !== "archivee" && e.categorieAge === categorieAge)
		.flatMap((e) =>
			(e.calendriers ?? [])
				.filter((c) => c.url)
				.map((c) => ({
					id: [e.slug, c.coupe ? "coupe" : c.libelle]
						.filter(Boolean)
						.join("-")
						.normalize("NFD")
						.replace(/[\u0300-\u036f]/g, "")
						.toLowerCase()
						.replace(/[^a-z0-9-]+/g, "-"),
					nom: c.coupe ? `${e.nom} — Coupe` : [e.nom, c.libelle].filter(Boolean).join(" "),
					coupe: Boolean(c.coupe),
					genre: GENRE_FFH[e.genre] ?? "",
					equipeSlug: e.slug,
					libelle: c.libelle || undefined,
					url: c.url,
					// Pour equipeDepuisCalendrier() : tous les calendriers de ce flux.
					calendriersDuFlux: (e.calendriers ?? [])
						.filter((x) => x.url === c.url)
						.map((x) => ({ equipeSlug: e.slug, repere: x.repere || "Handball Islois", libelle: x.libelle })),
				})),
		);
}

async function prochainMatch(equipe) {
	const maintenantMs = maintenant().getTime();
	return (
		(await lireIcs(equipe.url))
			.filter((ev) => ev.debut.getTime() > maintenantMs)
			.map((ev) => ({ ev, qui: equipeDepuisCalendrier(ev, equipe.calendriersDuFlux) }))
			// Un derby interne (SM1 - SM2) n'a rien à scouter : match suivant.
			.filter(({ qui }) => qui && !qui.derby && qui.equipeSlug === equipe.equipeSlug && (qui.equipeNumero ?? undefined) === equipe.libelle)
			.sort((a, b) => a.ev.debut - b.ev.debut)[0] ?? null
	);
}

/** Exécute une section de la fiche ; null si elle échoue (la page affiche
 * alors « données indisponibles » pour cette section seulement). */
async function section(nom, calcul) {
	try {
		return (await calcul()) ?? null;
	} catch (e) {
		log(`  ${nom} indisponible : ${e.message}`);
		return null;
	}
}

/** Sections de la fiche pour l'équipe `advId` de la poule `pouleBase`.
 * `hbiId` / `rencontreAVenirId` absents (coupe) : pas de match aller. */
async function analyserAdversaire({ pouleBase, poule, advId, hbiId, rencontreAVenirId, categorie }) {
	const sansId = ({ adversaireId, ...m }) => m;
	const joues = matchsJoues(poule.rencontres, advId);
	const aller = hbiId ? matchAller(poule.rencontres, hbiId, advId, rencontreAVenirId) : null;
	const forme = joues.slice(0, NB_MATCHS_FORME);
	const buteurs = await section("buteurs", async () => {
		const feuilles = [];
		for (const m of forme.filter((m) => !m.forfait)) {
			let joueurs = null;
			try {
				joueurs = await lireFeuille(pouleBase, m.rencontreId);
			} catch (e) {
				if (e instanceof ArretPourCeBuild) log(`  arrêt des requêtes : ${e.message}`);
			}
			if (joueurs === MASQUE) return { masques: true, liste: [], matchsAnalyses: 0, matchsDemandes: 0, partiel: false };
			feuilles.push({ match: m, joueurs });
		}
		const cumul = cumulerButeurs(feuilles, advId);
		if (!cumul) return null;
		const top = cumul.liste.slice(0, NB_BUTEURS);
		const libelles = libellesJoueurs(top, categorie.nomComplet);
		// Seul le libellé déjà réduit est écrit : jamais le nom complet d'un·e
		// mineur·e, même dans un fichier non publié.
		return { ...cumul, masques: false, liste: top.map((l, i) => ({ nom: libelles[i], buts: l.buts, matchs: l.matchs })) };
	});
	return {
		classement: poule.classement ? ligneClassement(poule.classement, advId) : null,
		forme: forme.length ? forme.map(sansId) : null,
		moyennes: moyennes(joues),
		aller: aller ? sansId(aller) : null,
		buteurs,
		journeesManquantes: poule.journeesManquantes,
	};
}

/** Fiche d'un adversaire de championnat : il est dans notre poule. */
async function ficheChampionnat(equipe, categorie, ev, qui, rencontre) {
	const journee = ev.journee ? Number(ev.journee.slice(1)) : null;
	const poule = await section("poule", () => lirePoule(rencontre.pouleBase, [journee]));
	const aVenir = poule?.rencontres.find((r) => r.ext_rencontreId === rencontre.rencontreId);
	if (!aVenir) {
		log(`${equipe.nom} : rencontre à venir introuvable dans la poule.`);
		return null;
	}
	const advId = qui.domicile ? aVenir.equipe2Id : aVenir.equipe1Id;
	return {
		adversaire: aVenir[qui.domicile ? "equipe2Libelle" : "equipe1Libelle"] ?? qui.adversaire,
		championnat: null,
		...(await analyserAdversaire({
			pouleBase: rencontre.pouleBase,
			poule,
			advId,
			hbiId: qui.domicile ? aVenir.equipe1Id : aVenir.equipe2Id,
			rencontreAVenirId: rencontre.rencontreId,
			categorie,
		})),
	};
}

/** Fiche d'un adversaire de coupe : forme, classement et buteurs de SON
 * championnat départemental (voir trouverChampionnat()). */
async function ficheCoupe(equipe, categorie, qui, rencontre) {
	const page = `${rencontre.pouleBase}/rencontre-${rencontre.rencontreId}/`;
	const score = await lireComposant(page, "competitions---competition-score");
	const cote = qui.domicile ? score?.away : score?.home;
	if (!cote?.extStructureId) {
		log(`${equipe.nom} : club adverse non identifié sur la page de la rencontre.`);
		return null;
	}
	// Adversaire à domicile : le code postal de la salle donne son
	// département, essayé en premier (évite de parcourir toute la ligue).
	let departement = null;
	if (!qui.domicile) {
		try {
			departement = (await lireComposant(page, "competitions---rencontre-salle"))?.equipement?.codePostal?.slice(0, 2) ?? null;
		} catch (e) {
			if (e instanceof ArretPourCeBuild) throw e;
		}
	}
	const trouve = await trouverChampionnat(cote.extStructureId, cote.name ?? qui.adversaire, equipe.genre, categorie.categorieAge, departement);
	if (!trouve) {
		log(`${equipe.nom} : championnat de l'adversaire de coupe introuvable.`);
		return null;
	}
	const leur = lireUrlRencontre(trouve.evenement.url);
	const journee = trouve.evenement.journee ? Number(trouve.evenement.journee.slice(1)) : null;
	const poule = await lirePoule(leur.pouleBase, [journee]);
	const reference = poule.rencontres.find((r) => r.ext_rencontreId === leur.rencontreId);
	const advId = reference ? idEquipeDansRencontre(reference, trouve.equipe) : null;
	if (!advId) {
		log(`${equipe.nom} : équipe de l'adversaire de coupe introuvable dans sa poule.`);
		return null;
	}
	return {
		adversaire: cote.name ?? qui.adversaire,
		championnat: { competition: trouve.competition, comite: trouve.comite, equipe: trouve.equipe },
		...(await analyserAdversaire({ pouleBase: leur.pouleBase, poule, advId, categorie })),
	};
}

async function ficheEquipe(equipe, categorie) {
	const base = { id: equipe.id, equipe: equipe.nom, coupe: equipe.coupe };
	let suivant;
	try {
		suivant = await prochainMatch(equipe);
	} catch (e) {
		log(`${equipe.nom} : calendrier illisible (${e.message}).`);
		return { ...base, statut: "indisponible" };
	}
	if (!suivant) return { ...base, statut: "aucun_match" };

	const { ev, qui } = suivant;
	const match = {
		date: ev.debut.toISOString(),
		domicile: qui.domicile,
		adversaire: qui.adversaire,
		journee: ev.journee ?? null,
		competition: ev.competition || null,
	};
	const rencontre = lireUrlRencontre(ev.url);
	if (!rencontre) return { ...base, statut: "ok", match, fiche: null };
	const fiche = await section("fiche", () => (equipe.coupe ? ficheCoupe(equipe, categorie, qui, rencontre) : ficheChampionnat(equipe, categorie, ev, qui, rencontre)));
	return { ...base, statut: "ok", match, fiche };
}

// Repartir d'un dossier vide : une fiche d'un build précédent ne doit
// jamais survivre à son match.
rmSync(SCOUTING_DIR, { recursive: true, force: true });
mkdirSync(SCOUTING_DIR, { recursive: true });

for (const categorie of CATEGORIES) {
	try {
		await ecrireCategorie(categorie);
	} catch (e) {
		// Jamais d'échec de build (fichier illisible, disque...) : la page de
		// la catégorie affichera « données indisponibles ».
		log(`${categorie.libelle} : ${e.message}`);
	}
}
log(`${requetes} requête(s)${arret ? `, arrêt anticipé : ${arret.message}` : ""}.`);

async function ecrireCategorie(categorie) {
	const equipes = equipesDeCategorie(categorie.categorieAge);
	const matchs = [];
	for (const equipe of equipes) {
		try {
			matchs.push(await ficheEquipe(equipe, categorie));
		} catch (e) {
			log(`${equipe.nom} : ${e.message}`);
			matchs.push({ id: equipe.id, equipe: equipe.nom, statut: "indisponible" });
		}
	}
	const sortie = { categorie: categorie.id, libelle: categorie.libelle, genereLe: new Date().toISOString(), matchs };
	writeFileSync(join(SCOUTING_DIR, `${categorie.id}.json`), JSON.stringify(sortie, null, "\t") + "\n", "utf-8");
	log(`${categorie.libelle} : ${matchs.length} équipe(s), ${matchs.filter((m) => m.fiche).length} fiche(s) adversaire.`);
}
