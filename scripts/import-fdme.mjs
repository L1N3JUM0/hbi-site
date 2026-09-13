#!/usr/bin/env node
/**
 * Génère la collection "resultats" à partir des feuilles de match (PDF)
 * déposées via Sveltia CMS dans src/content/feuilles-match/.
 *
 * Lancé automatiquement avant `astro build` (script "prebuild" dans
 * package.json), comme scripts/check-content-images.mjs. Contrairement à ce
 * dernier, une feuille illisible ou mal formée n'échoue JAMAIS le build :
 * elle est ignorée avec un avertissement clair dans les logs, et la
 * personne qui l'a déposée s'en rend compte simplement parce que le résultat
 * n'apparaît pas sur le site après la reconstruction (voir GUIDE-EDITION.md).
 *
 * Régénération, pas synchronisation : ce script réanalyse TOUTES les
 * feuilles à chaque build et réécrit `src/content/resultats/pdf-<code>.md`
 * en conséquence -- déterministe et idempotent (même PDF -> même fichier),
 * donc jamais de doublon même en cas d'exécutions répétées. Ces fichiers
 * générés ne sont pas commités (le build de déploiement est éphémère, voir
 * .github/workflows/deploy.yml) : c'est le PDF, commité lui, qui fait foi.
 *
 * Seul `equipeSlug` est préservé d'une régénération à l'autre quand la
 * détection automatique échoue (compétition non reconnue) mais qu'une
 * valeur avait déjà été corrigée à la main dans le fichier généré
 * précédent -- voir preserveEquipeSlugSiBesoin() plus bas.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFeuilleDeMatch, FeuilleFormatError } from "../src/lib/fdme/parseFeuille.mjs";

const FEUILLES_DIR = "src/content/feuilles-match";
const RESULTATS_DIR = "src/content/resultats";

mkdirSync(RESULTATS_DIR, { recursive: true });

function listPdfEntries() {
	if (!existsSync(FEUILLES_DIR)) return [];
	return readdirSync(FEUILLES_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((f) => join(FEUILLES_DIR, f));
}

/** Lit le champ `pdf:` du frontmatter d'une entrée CMS "Feuilles de match". */
function extractPdfFieldValue(mdPath) {
	const content = readFileSync(mdPath, "utf-8");
	const match = /^pdf:\s*"?([^"\n]+?)"?\s*$/m.exec(content);
	return match?.[1];
}

function resolvePdfFilePath(value) {
	const clean = value.startsWith("/") ? value.slice(1) : value;
	return join(process.cwd(), clean);
}

/** Si la détection automatique échoue (equipeSlug null) mais qu'une entrée
 * générée précédemment pour ce même code de rencontre avait déjà un
 * equipeSlug corrigé à la main, on le conserve plutôt que d'écraser avec du
 * vide -- voir le commentaire en tête de fichier. */
function preserveEquipeSlugSiBesoin(cible, equipeSlugDetecte) {
	if (equipeSlugDetecte) return equipeSlugDetecte;
	if (!existsSync(cible)) return "";
	const existant = /^equipeSlug:\s*"([^"]*)"/m.exec(readFileSync(cible, "utf-8"))?.[1];
	return existant || "";
}

function frontmatter(data) {
	const lignes = ["---"];
	const set = (cle, valeur) => lignes.push(`${cle}: ${JSON.stringify(valeur)}`);

	set("source", "pdf");
	set("codeRencontre", data.codeRencontre);
	set("equipeSlug", data.equipeSlug);
	set("date", data.date.toISOString());
	if (data.journee) set("journee", data.journee);
	if (data.competition) set("competition", data.competition);
	set("typeMatch", data.typeMatch);
	lignes.push(`domicile: ${data.domicile}`);
	set("adversaire", data.adversaire);
	if (data.salle) set("salle", data.salle);
	lignes.push(`scoreDomicile: ${data.scoreDomicile}`);
	lignes.push(`scoreExterieur: ${data.scoreExterieur}`);
	if (data.scoreMiTempsDomicile != null) lignes.push(`scoreMiTempsDomicile: ${data.scoreMiTempsDomicile}`);
	if (data.scoreMiTempsExterieur != null) lignes.push(`scoreMiTempsExterieur: ${data.scoreMiTempsExterieur}`);
	if (data.chronologie?.length) set("chronologie", data.chronologie);
	if (data.statsEquipeDomicile) set("statsEquipeDomicile", data.statsEquipeDomicile);
	if (data.statsEquipeExterieur) set("statsEquipeExterieur", data.statsEquipeExterieur);
	if (data.statsJoueurs?.length) set("statsJoueurs", data.statsJoueurs);
	lignes.push("---", "");
	return lignes.join("\n");
}

const entries = listPdfEntries();
let ok = 0;
let ignorees = 0;
const codesGeneres = new Set();

for (const entryPath of entries) {
	const pdfFieldValue = extractPdfFieldValue(entryPath);
	if (!pdfFieldValue) {
		console.warn(`[import-fdme] ${entryPath} : aucun champ "pdf" trouvé, ignoré.`);
		ignorees++;
		continue;
	}
	const pdfPath = resolvePdfFilePath(pdfFieldValue);
	if (!existsSync(pdfPath)) {
		console.warn(`[import-fdme] ${entryPath} : fichier PDF introuvable (${pdfPath}), ignoré.`);
		ignorees++;
		continue;
	}

	try {
		const bytes = new Uint8Array(readFileSync(pdfPath));
		const data = await parseFeuilleDeMatch(bytes);
		const cible = join(RESULTATS_DIR, `pdf-${data.codeRencontre.toLowerCase()}.md`);
		data.equipeSlug = preserveEquipeSlugSiBesoin(cible, data.equipeSlug);

		for (const avertissement of data.avertissements) {
			console.warn(`[import-fdme] ${pdfPath} : ${avertissement}`);
		}
		if (!data.equipeSlug) {
			console.warn(
				`[import-fdme] ${pdfPath} : équipe non détectée automatiquement pour la compétition "${data.competition}" -- ` +
					`à corriger à la main dans la fiche "${data.codeRencontre}" de la collection Résultats.`,
			);
		}

		writeFileSync(cible, frontmatter(data), "utf-8");
		codesGeneres.add(`pdf-${data.codeRencontre.toLowerCase()}.md`);
		ok++;
	} catch (error) {
		if (error instanceof FeuilleFormatError) {
			console.warn(`[import-fdme] ${pdfPath} : feuille non reconnue (${error.message}) -- ignorée.`);
		} else {
			console.warn(`[import-fdme] ${pdfPath} : erreur inattendue (${error.message}) -- ignorée.`);
		}
		ignorees++;
	}
}

// Nettoyage : une fiche générée dont la feuille source a été supprimée
// (ou renommée) de "Feuilles de match" ne doit pas rester indéfiniment.
// On ne supprime jamais une fiche saisie à la main (elle ne porte pas le
// préfixe "pdf-").
for (const fichier of existsSync(RESULTATS_DIR) ? readdirSync(RESULTATS_DIR) : []) {
	if (fichier.startsWith("pdf-") && fichier.endsWith(".md") && !codesGeneres.has(fichier)) {
		unlinkSync(join(RESULTATS_DIR, fichier));
		console.log(`[import-fdme] ${fichier} supprimé (feuille source disparue).`);
	}
}

console.log(`[import-fdme] ${ok} feuille(s) importée(s), ${ignorees} ignorée(s) sur ${entries.length} déposée(s).`);
