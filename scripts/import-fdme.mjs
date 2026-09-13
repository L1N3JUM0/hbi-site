#!/usr/bin/env node
/**
 * Génère la collection "resultats" à partir des feuilles de match (PDF)
 * déposées via Sveltia CMS dans src/content/feuilles-match/.
 *
 * Lancé automatiquement avant `astro build` (script "prebuild" dans
 * package.json), comme scripts/check-content-images.mjs. Contrairement à ce
 * dernier, une feuille illisible ou mal formée n'échoue JAMAIS le build :
 * elle est ignorée avec un avertissement clair dans les logs et un bandeau
 * visible sur /equipes (voir src/components/ErreursImport.astro), pour que
 * la personne qui l'a déposée comprenne que quelque chose n'a pas marché.
 *
 * Régénération, pas synchronisation : ce script réanalyse TOUTES les
 * feuilles à chaque build et réécrit `src/content/resultats/pdf-<code>.md`
 * en conséquence -- déterministe et idempotent (même PDF -> même fichier),
 * donc jamais de doublon même en cas d'exécutions répétées.
 *
 * Ces fichiers générés SONT commités par le workflow de déploiement (voir
 * l'étape "Committer les résultats..." dans .github/workflows/deploy.yml,
 * juste après `npm run build`) : c'est nécessaire pour qu'ils soient
 * visibles et corrigeables depuis le CMS, qui lit le dépôt réel sur GitHub
 * et non la sortie éphémère d'un build. C'est aussi ce qui permet à
 * `equipeSlug` d'être préservé d'un build à l'autre quand la détection
 * automatique échoue (compétition non reconnue) mais qu'une valeur a déjà
 * été corrigée à la main -- voir preserveEquipeSlugSiBesoin() plus bas ;
 * sans commit, chaque build CI repartirait d'une feuille vierge et cette
 * correction manuelle serait perdue à chaque reconstruction.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFeuilleDeMatch, FeuilleFormatError } from "../src/lib/fdme/parseFeuille.mjs";

const FEUILLES_DIR = "src/content/feuilles-match";
const RESULTATS_DIR = "src/content/resultats";
/** Régénéré à chaque build (jamais commité, voir .gitignore) : liste des
 * feuilles actuellement en échec, lue par ErreursImport.astro pour
 * afficher un avertissement visible sur le site -- sans ça, un échec
 * d'import (PDF mal formé, format inattendu...) ne serait visible que
 * dans les logs du build, invisible pour la personne qui l'a déposé. */
const ERREURS_PATH = "src/data/import-erreurs.generated.json";

mkdirSync(RESULTATS_DIR, { recursive: true });
mkdirSync("src/data", { recursive: true });

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

/**
 * Résout le champ `pdf:` en chemin de fichier réel. On ne peut pas se fier
 * à une seule convention : un chemin absolu ("/src/...") se résout depuis
 * la racine du dépôt, mais un chemin relatif écrit par le CMS peut être
 * relatif à la racine du dépôt OU au dossier de la collection selon la
 * configuration de `media_folder`/`public_folder` dans config.yml (les deux
 * se sont déjà vues en production, voir le commentaire sur le champ "pdf"
 * dans config.yml) -- on essaie donc les deux et on prend celui qui existe
 * vraiment, plutôt que de deviner et d'échouer silencieusement.
 */
function resolvePdfFilePath(value) {
	if (value.startsWith("/")) return join(process.cwd(), value.slice(1));

	const relatifRacine = join(process.cwd(), value);
	if (existsSync(relatifRacine)) return relatifRacine;

	const relatifCollection = join(process.cwd(), FEUILLES_DIR, value);
	if (existsSync(relatifCollection)) return relatifCollection;

	// Aucun des deux n'existe : on renvoie le plus probable (relatif au
	// dépôt) pour que le message d'erreur affiché à l'appelant soit clair.
	return relatifRacine;
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
/** @type {{ fichier: string, raison: string }[]} */
const erreurs = [];

for (const entryPath of entries) {
	const nomEntree = extractPdfFieldValue(entryPath)?.split("/").pop() ?? entryPath;

	const pdfFieldValue = extractPdfFieldValue(entryPath);
	if (!pdfFieldValue) {
		console.warn(`[import-fdme] ${entryPath} : aucun champ "pdf" trouvé, ignoré.`);
		erreurs.push({ fichier: entryPath, raison: "Aucun fichier PDF associé à cette entrée." });
		ignorees++;
		continue;
	}
	const pdfPath = resolvePdfFilePath(pdfFieldValue);
	if (!existsSync(pdfPath)) {
		console.warn(`[import-fdme] ${entryPath} : fichier PDF introuvable (${pdfPath}), ignoré.`);
		erreurs.push({ fichier: nomEntree, raison: "Le fichier PDF déposé est introuvable (problème technique de dépôt)." });
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
			const raison = `Équipe non détectée automatiquement pour la compétition « ${data.competition} ».`;
			console.warn(
				`[import-fdme] ${pdfPath} : ${raison} -- à corriger à la main dans la fiche "${data.codeRencontre}" de la collection Résultats.`,
			);
			erreurs.push({ fichier: `${data.codeRencontre} (${nomEntree})`, raison: `${raison} À corriger dans la collection Résultats du CMS.` });
		}

		writeFileSync(cible, frontmatter(data), "utf-8");
		codesGeneres.add(`pdf-${data.codeRencontre.toLowerCase()}.md`);
		ok++;
	} catch (error) {
		if (error instanceof FeuilleFormatError) {
			console.warn(`[import-fdme] ${pdfPath} : feuille non reconnue (${error.message}) -- ignorée.`);
			erreurs.push({ fichier: nomEntree, raison: "Format de feuille non reconnu (voir le PDF déposé : est-ce bien un export du site FFHandball, pas un scan ?)." });
		} else {
			console.warn(`[import-fdme] ${pdfPath} : erreur inattendue (${error.message}) -- ignorée.`);
			erreurs.push({ fichier: nomEntree, raison: "Erreur inattendue à la lecture du PDF." });
		}
		ignorees++;
	}
}

writeFileSync(ERREURS_PATH, JSON.stringify(erreurs, null, "\t") + "\n", "utf-8");

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
