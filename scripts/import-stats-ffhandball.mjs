#!/usr/bin/env node
/**
 * Génère la collection "statistiquesPoules" (classement + stats joueurs
 * agrégées par la fédération, saison en cours uniquement) à partir des
 * pages ffhandball.fr renseignées dans `calendriers[].statistiquesUrl` de
 * chaque équipe (voir src/content.config.ts).
 *
 * Même esprit que scripts/import-fdme.mjs, lancé juste avant lui dans le
 * script "prebuild" (voir package.json) : régénère tout à chaque exécution
 * (déterministe, idempotent), jamais d'échec de build si une poule est
 * introuvable ou si la page FFHandball a changé de format -- elle est alors
 * simplement absente de /statistiques, avec un avertissement dans les logs.
 *
 * Le site de la fédération fait tout son rendu côté serveur : chaque page
 * injecte son JSON directement dans le HTML, dans des balises
 * <smartfire-component name='...' attributes="...JSON échappé en entités
 * HTML...">. Pas besoin de navigateur headless : un fetch() + une
 * extraction par expression régulière suffisent (voir
 * extractComponentJson() plus bas) -- confirmé en explorant le site à la
 * main avant d'écrire ce script.
 *
 * Ces données ne servent qu'en vérification/complément de notre propre
 * extraction des feuilles de match (bien plus riche : 7m, tirs, discipline,
 * détail par match) -- jamais en remplacement. Le JSON brut ET complet de
 * chaque poule (toutes équipes confondues, pas seulement le HBI) est
 * conservé tel quel dans src/content/stats-brutes-ffhandball/, utile pour
 * un futur script de contrôle ou pour comprendre un changement de format
 * côté fédération.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lireFrontmatter } from "./frontmatter.mjs";
import { extraireNumeroEquipe } from "../src/lib/fdme/equipeMatch.mjs";

const EQUIPES_DIR = "src/content/equipes";
const BRUTES_DIR = "src/content/stats-brutes-ffhandball";
const POULES_DIR = "src/content/statistiques-poules";
/** ext_structureId du Handball Islois sur ffhandball.fr -- stable, retrouvé
 * identique sur le classement, les stats joueurs et le flux iCal existant
 * (voir src/lib/agenda.ts, URL competition-calendar.ffhandball.fr/c-.../s-3577.ics). */
const HBI_STRUCTURE_ID = "3577";
/** Pause entre deux requêtes vers ffhandball.fr (classement puis
 * statistiques d'une même poule, et entre deux poules différentes), pour ne
 * jamais bombarder le site de la fédération à chaque build. */
const DELAI_ENTRE_REQUETES_MS = 1500;

mkdirSync(BRUTES_DIR, { recursive: true });
mkdirSync(POULES_DIR, { recursive: true });

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Déduit l'identifiant de poule (utilisé comme nom de fichier) depuis
 * n'importe quelle URL de la compétition sur ffhandball.fr -- le chemin
 * contient toujours un segment "poule-<id>". `null` si absent (URL saisie
 * par erreur, ou page qui n'est pas une poule) : l'entrée est alors ignorée
 * plutôt que de deviner. */
function pouleIdDepuisUrl(url) {
	const correspondance = /\/poule-(\d+)\b/.exec(url);
	return correspondance ? correspondance[1] : null;
}

/** Reconstruit les URL des pages "Classement" et "Statistiques" d'une poule
 * à partir de N'IMPORTE QUELLE page de cette poule (calendrier, classement,
 * statistiques, actualités...) : impossible de savoir depuis quel onglet la
 * personne a copié le lien dans le CMS, donc on retire tout suffixe connu
 * pour repartir d'une base fiable. */
function urlsPourPoule(baseUrl) {
	const base = baseUrl.replace(/\/(calendrier-et-resultats|classements|statistiques|actualites)\/?(\?.*)?$/, "").replace(/\/$/, "");
	return { classementUrl: `${base}/classements/`, statistiquesUrl: `${base}/statistiques/` };
}

/** Extrait puis décode le JSON porté par un <smartfire-component name='...'
 * attributes="..."> du HTML rendu serveur de ffhandball.fr. `null` si ce
 * composant est absent de la page (page introuvable, format changé...). */
function extractComponentJson(html, componentName) {
	const pattern = new RegExp(`name='${componentName}' attributes="([^"]*)"`);
	const correspondance = pattern.exec(html);
	if (!correspondance) return null;
	const decode = correspondance[1]
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
	try {
		return JSON.parse(decode);
	} catch {
		return null;
	}
}

async function fetchComponentJson(url, componentName) {
	const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; hbi-site-import/1.0)" } });
	if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
	const html = await res.text();
	const data = extractComponentJson(html, componentName);
	if (!data) throw new Error(`Bloc "${componentName}" introuvable sur ${url} (page absente ou format changé)`);
	return data;
}

/** Équipes du club ayant un `statistiquesUrl` renseigné sur au moins une
 * entrée de leurs calendriers -- lecture directe en `fs`, comme
 * chargerEquipesCompetition() dans import-fdme.mjs : ce script tourne avant
 * `astro build`, `astro:content` n'est pas encore disponible. */
function chargerEquipesAvecStats() {
	if (!existsSync(EQUIPES_DIR)) return [];
	return readdirSync(EQUIPES_DIR)
		.filter((f) => f.endsWith(".md"))
		.flatMap((f) => {
			const data = lireFrontmatter(join(EQUIPES_DIR, f));
			if (!data.slug) return [];
			return (data.calendriers ?? [])
				.filter((c) => c.statistiquesUrl)
				.map((c) => ({ equipeSlug: data.slug, repere: c.repere || "Handball Islois", statistiquesUrl: c.statistiquesUrl }));
		});
}

function frontmatter(data) {
	const lignes = ["---"];
	const set = (cle, valeur) => lignes.push(`${cle}: ${JSON.stringify(valeur)}`);
	set("pouleUrl", data.pouleUrl);
	set("misAJour", data.misAJour.toISOString());
	set("classement", data.classement);
	set("joueurs", data.joueurs);
	lignes.push("---", "");
	return lignes.join("\n");
}

// Regrouper les équipes par poule (une poule partagée par deux équipes du
// club, ex. Seniors masculins 1 et 2, n'est interrogée qu'une seule fois).
const parPoule = new Map();
for (const entree of chargerEquipesAvecStats()) {
	const pouleId = pouleIdDepuisUrl(entree.statistiquesUrl);
	if (!pouleId) {
		console.warn(`[import-stats-ffhandball] URL sans identifiant de poule reconnu, ignorée : ${entree.statistiquesUrl}`);
		continue;
	}
	if (!parPoule.has(pouleId)) parPoule.set(pouleId, { pouleUrl: entree.statistiquesUrl, equipes: [] });
	parPoule.get(pouleId).equipes.push(entree);
}

/** "HANDBALL ISLOIS" (sans suffixe) désigne la première équipe du club dans
 * une poule, "HANDBALL ISLOIS 2" la deuxième -- convention différente de
 * celle du flux iCal (où la première équipe est déjà suffixée "1", voir
 * `repere` dans content.config.ts) : PAS la même source, donc pas la même
 * convention de nommage, une comparaison directe avec `repere` ne
 * fonctionnerait pas pour la première équipe. On réutilise directement
 * extraireNumeroEquipe(), déjà utilisée pour exactement cette même
 * convention "sans suffixe = équipe 1" sur les feuilles de match (voir
 * equipeMatch.mjs) -- `undefined` pour l'équipe 1, "2" pour la deuxième. */
function equipeNumeroDepuisLibelle(libelleFFHandball) {
	return extraireNumeroEquipe(libelleFFHandball ?? "") ?? undefined;
}

/** `equipeSlug` à utiliser pour toutes les lignes de cette poule -- toutes
 * les entrées `calendriers` qui partagent une même poule partagent aussi
 * forcément le même `equipeSlug` (seul `equipeNumero`/`repere` diffère,
 * même convention que pour "resultats", voir content.config.ts). Avertit et
 * prend la première si ce n'est exceptionnellement pas le cas (URL collée
 * par erreur sur deux équipes différentes). */
function equipeSlugPourPoule(pouleUrl, equipes) {
	const slugs = new Set(equipes.map((e) => e.equipeSlug));
	if (slugs.size > 1) {
		console.warn(`[import-stats-ffhandball] ${pouleUrl} : renseigné sur plusieurs équipes différentes (${[...slugs].join(", ")}) -- seule "${equipes[0].equipeSlug}" est utilisée.`);
	}
	return equipes[0].equipeSlug;
}

let ok = 0;
let ignorees = 0;
const pouleIds = [...parPoule.keys()];

for (let i = 0; i < pouleIds.length; i++) {
	const pouleId = pouleIds[i];
	const { pouleUrl, equipes } = parPoule.get(pouleId);
	const { classementUrl, statistiquesUrl } = urlsPourPoule(pouleUrl);

	try {
		const classementData = await fetchComponentJson(classementUrl, "competitions---classement");
		await sleep(DELAI_ENTRE_REQUETES_MS);
		const statsData = await fetchComponentJson(statistiquesUrl, "competitions---stats-joueurs");

		const brut = {
			url: pouleUrl,
			fetchedAt: new Date().toISOString(),
			classement: classementData.classements ?? [],
			statsJoueurs: statsData.rowsData ?? [],
		};
		writeFileSync(join(BRUTES_DIR, `${pouleId}.json`), JSON.stringify(brut, null, "\t") + "\n", "utf-8");

		const equipeSlug = equipeSlugPourPoule(pouleUrl, equipes);

		const classement = brut.classement
			.filter((c) => c.ext_structureId === HBI_STRUCTURE_ID)
			.map((c) => ({
				equipeSlug,
				equipeNumero: equipeNumeroDepuisLibelle(c.equipe_libelle),
				place: Number(c.place),
				point: Number(c.point),
				joue: Number(c.joue),
				gagne: Number(c.gagne),
				nul: Number(c.nul),
				perdu: Number(c.perdu),
				butPlus: Number(c.butPlus),
				butMoins: Number(c.butMoins),
				diff: Number(c.diff),
			}));

		// Pas de ext_structureId sur les lignes de stats joueurs (voir le
		// commentaire en tête de fichier) : seul le nom du club, en toutes
		// lettres dans le libellé, permet de reconnaître ses lignes -- même
		// motif que CLUB_PATTERN dans src/lib/agenda.ts.
		const joueurs = brut.statsJoueurs
			.filter((j) => /^handball\s+islois\b/i.test(j.equipeLibelle ?? ""))
			.map((j) => ({
				individuId: String(j.individuId),
				nom: j.nom,
				prenom: j.prenom,
				matchCount: Number(j.matchCount),
				totalButs: Number(j.totalButs),
				totalArrets: Number(j.totalArrets),
				equipeSlug,
				equipeNumero: equipeNumeroDepuisLibelle(j.equipeLibelle),
			}));

		if (classement.length === 0 && joueurs.length === 0) {
			console.warn(`[import-stats-ffhandball] ${pouleUrl} : aucune ligne du HBI reconnue (structureId ou libellé), ignoré.`);
			ignorees++;
		} else {
			writeFileSync(join(POULES_DIR, `${pouleId}.md`), frontmatter({ pouleUrl, misAJour: new Date(), classement, joueurs }), "utf-8");
			ok++;
		}
	} catch (error) {
		console.warn(`[import-stats-ffhandball] ${pouleUrl} : ${error.message} -- ignoré.`);
		ignorees++;
	}

	if (i < pouleIds.length - 1) await sleep(DELAI_ENTRE_REQUETES_MS);
}

// Nettoyage : un fichier généré pour une poule qu'AUCUNE équipe ne référence
// plus (statistiquesUrl vidé ou changé dans le CMS) ne doit pas rester
// indéfiniment. Volontairement basé sur `pouleIds` (poules actuellement
// référencées) plutôt que sur les poules importées AVEC SUCCÈS cette
// exécution : contrairement à un PDF déposé localement (import-fdme.mjs),
// la source ici est un site distant qu'on ne contrôle pas -- un échec
// ponctuel (site indisponible, page qui répond mal une fois) ne doit pas
// faire disparaître des données valides de la veille, seulement les
// rafraîchir dès que le prochain build réussit.
const pouleIdsReferences = new Set(pouleIds);
for (const [dir, extension] of [
	[POULES_DIR, ".md"],
	[BRUTES_DIR, ".json"],
]) {
	for (const fichier of existsSync(dir) ? readdirSync(dir) : []) {
		if (!fichier.endsWith(extension)) continue;
		const id = fichier.slice(0, -extension.length);
		if (!pouleIdsReferences.has(id)) {
			unlinkSync(join(dir, fichier));
			console.log(`[import-stats-ffhandball] ${join(dir, fichier)} supprimé (poule non référencée par une équipe).`);
		}
	}
}

console.log(`[import-stats-ffhandball] ${ok} poule(s) importée(s), ${ignorees} ignorée(s) sur ${pouleIds.length} référencée(s).`);
