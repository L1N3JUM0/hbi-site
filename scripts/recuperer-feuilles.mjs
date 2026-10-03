#!/usr/bin/env node
/**
 * Récupération automatique des feuilles de match (décisions du club du
 * 28/09/2026). Premier maillon de "prebuild", juste avant
 * scripts/import-fdme.mjs.
 *
 * 1. Lit les calendriers FFHandball (.ics) déjà renseignés dans les fiches
 *    équipes (`calendriers[].url`), et garde les matchs de la saison en
 *    cours commencés depuis plus de 2 h.
 * 2. Pour chacun, lit sa page sur ffhandball.fr (score + code de feuille) :
 *    - aucun score : match non joué ou reporté -> on retentera, sans jamais
 *      l'abandonner ni réclamer de dépôt manuel (voir etatDuMatch()) ;
 *    - forfait désigné sans ambiguïté -> résultat créé directement
 *      (`ffh-<code>.md`, source "ffhandball") ; sinon signalé, jamais deviné ;
 *    - score -> téléchargement du PDF dans `.feuilles-auto/` (ignoré par git,
 *      JAMAIS dans le dossier des feuilles du CMS), accompagné de l'équipe
 *      déduite du calendrier : import-fdme.mjs l'extrait puis le supprime
 *      dans la foulée, avant tout commit. Feuille encore absente 21 jours
 *      après l'apparition du score -> "abandon" et demande de dépôt manuel
 *      dans le bandeau, avec nouvelle tentative à chaque build malgré tout.
 * 3. Mémorise l'état de chaque rencontre dans src/data/feuilles-auto.json
 *    (commité) pour ne pas relire chaque jour les matchs déjà traités.
 *
 * Le dépôt manuel dans "Feuilles de match" reste possible en secours (match
 * absent des calendriers, feuille jamais publiée...) : même code de
 * rencontre -> même fichier de résultat, aucun doublon.
 *
 * Jamais d'échec de build : réseau indisponible, limite de débit (429) ou
 * page au format inattendu -> arrêt pour ce build, reprise au suivant.
 *
 * `--dry-run` : lit calendriers et pages, affiche les décisions, ne
 * télécharge ni n'écrit rien. `RECUPERATION_FEUILLES=0` désactive le script
 * (ex. build local hors ligne).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireFrontmatter } from "./frontmatter.mjs";
import { categorieIgnoree } from "../src/lib/fdme/categoriesIgnorees.mjs";
import { detectEquipe } from "../src/lib/fdme/equipeMatch.mjs";
import { saisonActuelle, saisonPour } from "../src/lib/fdme/saison.mjs";
import {
	DELAI_ABANDON_MS,
	DELAI_APRES_DEBUT_MS,
	DOSSIER_TEMPORAIRE,
	ETAT_PATH,
	STATUTS_TERMINES,
	equipeDepuisCalendrier,
	etatDuMatch,
	lireCalendrier,
	lireRencontre,
	priorite,
} from "../src/lib/fdme/recuperation.mjs";

const EQUIPES_DIR = "src/content/equipes";
const RESULTATS_DIR = "src/content/resultats";
/** Plafond de rencontres examinées par build, et pause entre deux requêtes :
 * quelques matchs par week-end suffisent largement, inutile de solliciter
 * davantage les serveurs de la fédération (limite de débit constatée). */
const MAX_RENCONTRES_PAR_BUILD = 15;
const PAUSE_MS = 2000;
const UA = { headers: { "User-Agent": "Mozilla/5.0 (compatible; hbi-site-import/1.0)" } };

const dryRun = process.argv.includes("--dry-run");
const log = (m) => console.log(`[recuperer-feuilles]${dryRun ? " (essai à blanc)" : ""} ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.RECUPERATION_FEUILLES === "0") {
	log("désactivé (RECUPERATION_FEUILLES=0).");
	process.exit(0);
}

class ArretPourCeBuild extends Error {}

async function telecharger(url) {
	let res;
	try {
		res = await fetch(url, UA);
	} catch (e) {
		throw new ArretPourCeBuild(`réseau indisponible (${e.message})`);
	}
	if (res.status === 429 || res.status >= 500) throw new ArretPourCeBuild(`HTTP ${res.status} sur ${url}`);
	return res;
}

/** Calendriers des équipes actives, regroupés par flux : un même .ics peut
 * servir deux équipes du club dans la même poule (ex. Seniors 1 et 2). */
function calendriersParFlux() {
	const parFlux = new Map();
	for (const f of readdirSync(EQUIPES_DIR).filter((f) => f.endsWith(".md"))) {
		const e = lireFrontmatter(join(EQUIPES_DIR, f));
		if (!e.slug || e.statut === "archivee") continue;
		for (const c of e.calendriers ?? []) {
			if (!c.url) continue;
			const liste = parFlux.get(c.url) ?? [];
			liste.push({ equipeSlug: e.slug, repere: c.repere ?? "", libelle: c.libelle ?? "" });
			parFlux.set(c.url, liste);
		}
	}
	return parFlux;
}

const JOUR_PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" });
const cleManuelle = (date, equipeSlug, domicile) => `${JOUR_PARIS.format(new Date(date))}|${equipeSlug}|${domicile}`;

/** Codes déjà importés, et matchs saisis à la main en secours (sans code de
 * rencontre) repérés par jour + équipe + camp : sans ce second repère, un
 * résultat saisi à la main serait créé une seconde fois par la
 * récupération. (Pas l'adversaire : son nom saisi à la main ne correspond
 * jamais exactement à celui de la fédération.) */
function resultatsExistants() {
	const codes = new Set();
	const manuels = new Set();
	for (const f of readdirSync(RESULTATS_DIR).filter((f) => f.endsWith(".md"))) {
		const r = lireFrontmatter(join(RESULTATS_DIR, f));
		if (r.codeRencontre) codes.add(r.codeRencontre);
		else if (r.date && r.equipeSlug) manuels.add(cleManuelle(r.date, r.equipeSlug, r.domicile));
	}
	return { codes, manuels };
}

/** Résultat d'un forfait : pas de feuille, pas de score (voir le champ
 * `forfait` dans content.config.ts). */
function ecrireForfait(code, c, fautif) {
	const nous = c.equipe.domicile ? "domicile" : "exterieur";
	const lignes = [
		"---",
		`source: "ffhandball"`,
		`codeRencontre: ${JSON.stringify(code)}`,
		`equipeSlug: ${JSON.stringify(c.equipe.equipeSlug)}`,
		...(c.equipe.equipeNumero ? [`equipeNumero: ${JSON.stringify(c.equipe.equipeNumero)}`] : []),
		`date: ${JSON.stringify(c.ev.debut.toISOString())}`,
		...(c.ev.journee ? [`journee: ${JSON.stringify(c.ev.journee)}`] : []),
		`competition: ${JSON.stringify(c.ev.competition)}`,
		`typeMatch: ${JSON.stringify(detectEquipe(c.ev.competition, []).typeMatch)}`,
		`domicile: ${c.equipe.domicile}`,
		`adversaire: ${JSON.stringify(c.equipe.adversaire)}`,
		`forfait: ${JSON.stringify(fautif === nous ? "nous" : "adversaire")}`,
		"---",
		"",
	];
	writeFileSync(join(RESULTATS_DIR, `ffh-${code.toLowerCase()}.md`), lignes.join("\n"), "utf-8");
}

const maintenant = new Date();
const saison = saisonActuelle(maintenant);
const etat = existsSync(ETAT_PATH) ? JSON.parse(readFileSync(ETAT_PATH, "utf-8")) : { rencontres: {} };
const existants = resultatsExistants();

// Les rencontres des saisons précédentes n'ont plus rien à attendre.
for (const [uid, r] of Object.entries(etat.rencontres)) {
	if (r.date && saisonPour(new Date(r.date)) !== saison) delete etat.rencontres[uid];
}

const candidats = [];
const vus = new Set();
for (const [url, calendriers] of calendriersParFlux()) {
	let evenements;
	try {
		const res = await fetch(url, UA);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		evenements = lireCalendrier(await res.text());
	} catch (e) {
		console.warn(`[recuperer-feuilles] calendrier illisible (${url}) : ${e.message}`);
		continue;
	}
	for (const ev of evenements) {
		if (vus.has(ev.uid) || !ev.url) continue;
		vus.add(ev.uid);
		if (saisonPour(ev.debut) !== saison || ev.debut.getTime() + DELAI_APRES_DEBUT_MS > maintenant.getTime()) continue;
		const precedent = etat.rencontres[ev.uid];
		if (precedent && STATUTS_TERMINES.has(precedent.statut)) continue;
		if (categorieIgnoree(ev.competition)) {
			etat.rencontres[ev.uid] = { statut: "ignoree", date: ev.debut.toISOString(), competition: ev.competition };
			continue;
		}
		candidats.push({ ev, precedent, equipe: equipeDepuisCalendrier(ev, calendriers) });
	}
}

candidats.sort((a, b) => priorite(a.precedent) - priorite(b.precedent) || a.ev.debut - b.ev.debut);
if (!dryRun) mkdirSync(DOSSIER_TEMPORAIRE, { recursive: true });
const bilan = {};

try {
	for (const c of candidats.slice(0, MAX_RENCONTRES_PAR_BUILD)) {
		await sleep(PAUSE_MS);
		const res = await telecharger(c.ev.url);
		const rencontre = res.ok ? lireRencontre(await res.text()) : null;
		// Sans la raison du statut précédent : chaque nouveau statut pose la
		// sienne s'il en a une (voir suivreAuto() dans import-fdme.mjs).
		const { raison: _raisonPrecedente, ...precedent } = c.precedent ?? {};
		const suivi = {
			...precedent,
			date: c.ev.debut.toISOString(),
			competition: c.ev.competition,
			adversaire: c.equipe?.adversaire,
			equipeSlug: c.equipe?.equipeSlug,
			url: c.ev.url,
			derniereTentative: maintenant.toISOString(),
		};
		const noter = (statut, extra = {}) => {
			etat.rencontres[c.ev.uid] = { ...suivi, ...extra, statut };
			bilan[statut] = (bilan[statut] ?? 0) + 1;
			if (dryRun) log(`${c.ev.debut.toISOString().slice(0, 10)} ${c.ev.titre} -> ${statut}`);
		};

		if (!rencontre) {
			console.warn(`[recuperer-feuilles] page de rencontre illisible (HTTP ${res.status}) : ${c.ev.url}`);
			noter("page_illisible");
			continue;
		}
		suivi.code = rencontre.code ?? suivi.code;
		const saisiALaMain = c.equipe?.equipeSlug && existants.manuels.has(cleManuelle(c.ev.debut, c.equipe.equipeSlug, c.equipe.domicile));
		if ((rencontre.code && existants.codes.has(rencontre.code)) || saisiALaMain) {
			noter("importee");
			continue;
		}
		const match = etatDuMatch(rencontre);
		if (match.etat === "non_joue") {
			noter("attente_score");
		} else if (match.etat === "ambigu" || (match.etat === "forfait" && (!c.equipe || c.equipe.derby || !rencontre.code))) {
			noter("forfait_ambigu", { raison: match.raison ?? "impossible de savoir quel camp est le HBI" });
		} else if (match.etat === "forfait") {
			if (!dryRun) ecrireForfait(rencontre.code, c, match.fautif);
			noter("forfait_cree");
		} else if (!rencontre.code) {
			noter("attente_feuille", { scoreVuLe: suivi.scoreVuLe ?? maintenant.toISOString() });
		} else {
			const scoreVuLe = suivi.scoreVuLe ?? maintenant.toISOString();
			if (dryRun) {
				noter("a_telecharger", { scoreVuLe });
				continue;
			}
			await sleep(PAUSE_MS);
			const code = rencontre.code;
			const pdf = await telecharger(`https://fdm.fdme.ffhandball.fr/${code[0]}/${code[1]}/${code[2]}/${code[3]}/${code}.pdf`);
			const octets = new Uint8Array(await pdf.arrayBuffer());
			if (pdf.ok && octets[0] === 0x25) {
				writeFileSync(join(DOSSIER_TEMPORAIRE, `${code}.pdf`), octets);
				// L'équipe déduite du calendrier accompagne le PDF : elle fait foi à
				// l'import (voir import-fdme.mjs), la détection par nom de
				// compétition ne sert plus que de contrôle.
				writeFileSync(
					join(DOSSIER_TEMPORAIRE, `${code}.json`),
					JSON.stringify({ uid: c.ev.uid, equipe: c.equipe?.derby ? null : c.equipe }),
				);
				noter("telechargee", { scoreVuLe });
			} else {
				const abandon = maintenant.getTime() - new Date(scoreVuLe).getTime() > DELAI_ABANDON_MS;
				noter(abandon ? "abandon" : "attente_feuille", { scoreVuLe });
			}
		}
	}
} catch (e) {
	if (!(e instanceof ArretPourCeBuild)) throw e;
	console.warn(`[recuperer-feuilles] arrêt pour ce build, reprise au suivant : ${e.message}`);
}

if (!dryRun) {
	mkdirSync("src/data", { recursive: true });
	writeFileSync(ETAT_PATH, JSON.stringify(etat, null, "\t") + "\n", "utf-8");
}
log(
	`${candidats.length} rencontre(s) à examiner, ${Math.min(candidats.length, MAX_RENCONTRES_PAR_BUILD)} examinée(s) : ` +
		(Object.entries(bilan)
			.map(([s, n]) => `${n} ${s}`)
			.join(", ") || "rien de nouveau"),
);
