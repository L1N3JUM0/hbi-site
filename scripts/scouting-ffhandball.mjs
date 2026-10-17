#!/usr/bin/env node
/**
 * Données des pages de scouting réservées aux coachs (preuve de concept
 * Seniors / U17 / U18, demande du 17/10/2026). Dernier maillon de
 * "prebuild" avant la vérification des images.
 *
 * Pour chaque équipe du club de ces catégories (championnat seulement, la
 * coupe est exclue) :
 * 1. son prochain match d'après le flux iCal FFHandball déjà renseigné dans
 *    sa fiche (`calendriers[].url`) -- l'URL de l'événement donne la poule
 *    et l'identifiant de la rencontre ;
 * 2. la poule sur ffhandball.fr : classement + résultats journée par
 *    journée (JSON injecté dans le HTML, même extraction que
 *    import-stats-ffhandball.mjs) -- la rencontre à venir y donne
 *    l'identifiant fédéral de l'adversaire, sans comparer de noms ;
 * 3. la page de ses 5 derniers matchs, pour les buteurs.
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
	cumulerButeurs,
	journeesALire,
	libellesJoueurs,
	ligneClassement,
	lireUrlRencontre,
	matchAller,
	matchsJoues,
	moyennes,
} from "../src/lib/scouting/analyse.mjs";

const EQUIPES_DIR = "src/content/equipes";
const SCOUTING_DIR = "src/data/scouting";
/** Catégories de la preuve de concept, par `categorieAge` de la fiche
 * équipe. `nomComplet` : seuls les seniors (majeur·e·s) sont nommé·e·s en
 * entier, prénom + initiale pour les jeunes. */
const CATEGORIES = [
	{ id: "seniors", libelle: "Seniors", categorieAge: "senior", nomComplet: true },
	{ id: "u17", libelle: "U17", categorieAge: "U17", nomComplet: false },
	{ id: "u18", libelle: "U18", categorieAge: "U18", nomComplet: false },
];
const NB_MATCHS_FORME = 5;
const NB_BUTEURS = 8;
/** Même politesse que les autres imports : pause entre deux requêtes, et
 * plafond par build pour ne jamais bombarder le site de la fédération. */
const PAUSE_MS = 1500;
const MAX_REQUETES = 150;
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

/** Classement + toutes les rencontres utiles d'une poule. Une journée
 * illisible est simplement manquante (forme et moyennes alors calculées sur
 * ce qui reste) ; sans la page d'accueil de la poule, rien n'est possible. */
function lirePoule(base, journeesAVenir) {
	return unique(`poule:${base}`, async () => {
		const accueil = await lirePage(`${base}/`);
		const selecteur = extraireComposant(accueil, "competitions---journee-selector");
		const journees = JSON.parse(selecteur?.poule?.journees ?? "[]");
		const selection = Number(selecteur?.selected_numero_journee);
		const rencontres = [...(extraireComposant(accueil, "competitions---rencontre-list")?.rencontres ?? [])];
		let journeesManquantes = 0;
		for (const n of journeesALire(journees, jourParis(maintenant()), journeesAVenir)) {
			if (n === selection) continue;
			try {
				const liste = extraireComposant(await lirePage(`${base}/journee-${n}/`), "competitions---rencontre-list");
				if (!liste) throw new Error("format inattendu");
				rencontres.push(...(liste.rencontres ?? []));
			} catch (e) {
				if (e instanceof ArretPourCeBuild) throw e;
				journeesManquantes++;
			}
		}
		let classement = null;
		try {
			classement = extraireComposant(await lirePage(`${base}/classements/`), "competitions---classement")?.classements ?? null;
		} catch (e) {
			if (e instanceof ArretPourCeBuild) throw e;
		}
		return { rencontres, classement, journeesManquantes };
	});
}

const lireFeuille = (base, rencontreId) =>
	unique(`rencontre:${rencontreId}`, async () => {
		const liste = extraireComposant(await lirePage(`${base}/rencontre-${rencontreId}/`), "competitions---rencontre-liste-joueurs");
		if (!liste || liste.hideButs) return null;
		return liste.statsJoueurs ?? null;
	});

/** Équipes du club d'une catégorie, une entrée par calendrier de
 * championnat (SM1 et SM2 séparément). */
function equipesDeCategorie(categorieAge) {
	if (!existsSync(EQUIPES_DIR)) return [];
	return readdirSync(EQUIPES_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((f) => lireFrontmatter(join(EQUIPES_DIR, f)))
		.filter((e) => e.slug && e.type === "competition" && e.statut !== "archivee" && e.categorieAge === categorieAge)
		.flatMap((e) =>
			(e.calendriers ?? [])
				.filter((c) => c.url && !c.coupe)
				.map((c) => ({
					id: [e.slug, c.libelle].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
					nom: [e.nom, c.libelle].filter(Boolean).join(" "),
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

async function ficheEquipe(equipe, categorie) {
	const base = { id: equipe.id, equipe: equipe.nom };
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

	const journee = ev.journee ? Number(ev.journee.slice(1)) : null;
	const poule = await section("poule", () => lirePoule(rencontre.pouleBase, [journee]));
	const aVenir = poule?.rencontres.find((r) => r.ext_rencontreId === rencontre.rencontreId);
	if (!aVenir) {
		log(`${equipe.nom} : rencontre à venir introuvable dans la poule.`);
		return { ...base, statut: "ok", match, fiche: null };
	}
	const hbiId = qui.domicile ? aVenir.equipe1Id : aVenir.equipe2Id;
	const advId = qui.domicile ? aVenir.equipe2Id : aVenir.equipe1Id;

	const joues = matchsJoues(poule.rencontres, advId);
	const aller = matchAller(poule.rencontres, hbiId, advId, rencontre.rencontreId);
	const sansId = ({ adversaireId, ...m }) => m;
	const forme = joues.slice(0, NB_MATCHS_FORME);
	const buteurs = await section("buteurs", async () => {
		const aLire = forme.filter((m) => !m.forfait);
		const feuilles = [];
		for (const m of aLire) {
			let joueurs = null;
			try {
				joueurs = await lireFeuille(rencontre.pouleBase, m.rencontreId);
			} catch (e) {
				if (e instanceof ArretPourCeBuild) log(`  arrêt des requêtes : ${e.message}`);
			}
			feuilles.push({ match: m, joueurs });
		}
		const cumul = cumulerButeurs(feuilles, advId);
		if (!cumul) return null;
		const top = cumul.liste.slice(0, NB_BUTEURS);
		const libelles = libellesJoueurs(top, categorie.nomComplet);
		// Seul le libellé déjà réduit est écrit : jamais le nom complet d'un·e
		// mineur·e, même dans un fichier non publié.
		return { ...cumul, liste: top.map((l, i) => ({ nom: libelles[i], buts: l.buts, matchs: l.matchs })) };
	});

	return {
		...base,
		statut: "ok",
		match,
		fiche: {
			adversaire: aVenir[qui.domicile ? "equipe2Libelle" : "equipe1Libelle"] ?? qui.adversaire,
			classement: poule.classement ? ligneClassement(poule.classement, advId) : null,
			forme: forme.length ? forme.map(sansId) : null,
			moyennes: moyennes(joues),
			aller: aller ? sansId(aller) : null,
			buteurs,
			journeesManquantes: poule.journeesManquantes,
		},
	};
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
