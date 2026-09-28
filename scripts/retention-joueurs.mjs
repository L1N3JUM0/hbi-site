#!/usr/bin/env node
/**
 * Applique la règle de conservation des lignes joueur·se (voir
 * src/lib/fdme/retention.mjs) à TOUTE la collection "resultats" : retire des
 * fichiers les lignes des personnes absentes depuis plus de 3 saisons
 * complètes. Lancé dans "prebuild" juste après scripts/import-fdme.mjs (une
 * feuille qui vient d'être extraite passe donc aussi par ce filtre avant
 * d'être commitée), et les fichiers modifiés sont commités par le workflow
 * de déploiement comme le reste des résultats.
 *
 * `--dry-run` : n'écrit rien, affiche ce qui serait retiré (personnes,
 * lignes, fichiers) -- à lancer avant tout changement de la règle ou tout
 * import d'anciennes saisons.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { lireFrontmatter } from "./frontmatter.mjs";
import { regleConservation, SAISONS_ABSENCE } from "../src/lib/fdme/retention.mjs";
import { saisonActuelle, saisonPour } from "../src/lib/fdme/saison.mjs";

const RESULTATS_DIR = "src/content/resultats";
const dryRun = process.argv.includes("--dry-run");
const saisonEnCours = saisonActuelle();

const fichiers = readdirSync(RESULTATS_DIR)
	.filter((f) => f.endsWith(".md"))
	.map((f) => ({ fichier: f, data: lireFrontmatter(join(RESULTATS_DIR, f)) }))
	.filter(({ data }) => data.date);

const regle = regleConservation(
	fichiers.map(({ data }) => data),
	saisonEnCours,
);

/** Réécrit uniquement la liste statsJoueurs d'un fichier. Les fichiers
 * générés par l'import portent chaque champ sur UNE ligne JSON : on ne
 * remplace que cette ligne, pour un diff lisible. Un fichier réenregistré
 * depuis le CMS (YAML multi-lignes) est réécrit entièrement via js-yaml. */
function reecrire(chemin, statsJoueurs) {
	const contenu = readFileSync(chemin, "utf-8");
	const ligne = /^statsJoueurs: .*$/m;
	const uneLigneJson = contenu.match(ligne)?.[0].slice("statsJoueurs: ".length);
	let estJson = false;
	try {
		estJson = uneLigneJson != null && Array.isArray(JSON.parse(uneLigneJson));
	} catch {}
	if (estJson) {
		const remplacement = statsJoueurs.length ? `statsJoueurs: ${JSON.stringify(statsJoueurs)}` : "";
		writeFileSync(chemin, contenu.replace(statsJoueurs.length ? ligne : /^statsJoueurs: .*\r?\n/m, remplacement), "utf-8");
		return;
	}
	const [, fm, corps] = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(contenu);
	const data = yaml.load(fm);
	if (statsJoueurs.length) data.statsJoueurs = statsJoueurs;
	else delete data.statsJoueurs;
	writeFileSync(chemin, `---\n${yaml.dump(data, { lineWidth: -1 })}---\n${corps}`, "utf-8");
}

const personnesRetirees = new Map(); // empreinte (ou nom si sans empreinte) -> { nom, derniereSaison, lignes }
let lignesRetirees = 0;
let fichiersModifies = 0;
const parSaison = new Map();

for (const { fichier, data } of fichiers) {
	const lignes = data.statsJoueurs ?? [];
	const gardees = lignes.filter((l) => !regle.estRetire(data, l));
	if (gardees.length === lignes.length) continue;

	for (const l of lignes.filter((l) => regle.estRetire(data, l))) {
		const cle = l.licenceHash ?? `sans-empreinte:${l.nom}|${l.prenom}`;
		const debut = regle.derniereSaison.get(l.licenceHash) ?? Number(saisonPour(new Date(data.date)).slice(0, 4));
		const p = personnesRetirees.get(cle) ?? { nom: `${l.prenom} ${l.nom}`, derniereSaison: `${debut}-${debut + 1}`, lignes: 0 };
		p.lignes++;
		personnesRetirees.set(cle, p);
	}
	const saison = saisonPour(new Date(data.date));
	parSaison.set(saison, (parSaison.get(saison) ?? 0) + (lignes.length - gardees.length));
	lignesRetirees += lignes.length - gardees.length;
	fichiersModifies++;
	if (!dryRun) reecrire(join(RESULTATS_DIR, fichier), gardees);
}

const prefixe = `[retention-joueurs]${dryRun ? " (essai à blanc, rien n'est écrit)" : ""}`;
console.log(
	`${prefixe} saison en cours ${saisonEnCours}, seuil : absent·e depuis plus de ${SAISONS_ABSENCE} saisons complètes -> ` +
		`${personnesRetirees.size} personne(s), ${lignesRetirees} ligne(s) retirée(s) dans ${fichiersModifies} fichier(s).`,
);
if (dryRun && personnesRetirees.size) {
	console.log(`${prefixe} lignes retirées par saison du match :`, Object.fromEntries([...parSaison].sort()));
	for (const p of [...personnesRetirees.values()].sort((a, b) => a.derniereSaison.localeCompare(b.derniereSaison) || a.nom.localeCompare(b.nom))) {
		console.log(`   ${p.derniereSaison}  ${p.nom}  (${p.lignes} ligne(s))`);
	}
}
