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
 * Analyse unique, puis le PDF est consommé (décision du club, 28/09/2026) :
 * une feuille de match porte les noms ET les numéros de licence en clair de
 * tou·te·s les joueur·se·s, elle ne doit donc pas rester dans le dépôt
 * (public). Dès qu'une feuille est extraite avec succès, le résultat est
 * écrit dans `src/content/resultats/pdf-<code>.md` avec `source: "archive"`,
 * puis le PDF ET son entrée "Feuilles de match" sont supprimés. Le résultat
 * archivé n'est plus jamais régénéré : c'est lui qui fait foi, et les
 * corrections faites à la main dans le CMS y restent. Une feuille
 * redéposée (même code de rencontre) remplace simplement l'archive, en
 * gardant l'équipe corrigée à la main si la détection échoue encore (voir
 * preserverCorrectionsManuelles()). Une feuille illisible, elle, n'est PAS
 * consommée : elle reste visible dans le CMS avec le bandeau d'erreur,
 * jusqu'à ce que la personne la supprime ou en dépose une autre.
 *
 * Les lignes joueur·se des résultats écrits ici passent ensuite par la
 * règle de conservation des 3 saisons (scripts/retention-joueurs.mjs, lancé
 * juste après dans "prebuild").
 *
 * Ces fichiers SONT commités par le workflow de déploiement (voir l'étape
 * "Committer les résultats..." dans .github/workflows/deploy.yml, juste
 * après `npm run build`), avec la suppression des PDF consommés : c'est
 * nécessaire pour qu'ils soient visibles et corrigeables depuis le CMS, qui
 * lit le dépôt réel sur GitHub et non la sortie éphémère d'un build.
 *
 * `source: "pdf"` (régénéré à chaque build tant que le PDF est là) est
 * l'ancien fonctionnement : il ne reste que pour les fiches écrites avant ce
 * changement, et disparaît au premier build qui consomme leur PDF.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFeuilleDeMatch, FeuilleFormatError } from "../src/lib/fdme/parseFeuille.mjs";
import { libellesCompetitionIncomplets } from "../src/lib/fdme/equipeMatch.mjs";
import { lireFrontmatter } from "./frontmatter.mjs";

// Charge le pépin de hachage des licences (voir src/lib/fdme/licenceHash.mjs)
// depuis .env.local en local -- en CI, il est injecté directement comme
// variable d'environnement (secret GitHub Actions), pas de fichier à lire.
try {
	process.loadEnvFile(".env.local");
} catch {
	// Pas de .env.local : normal en CI, ou si le pépin est déjà exporté
	// autrement dans l'environnement courant.
}

const FEUILLES_DIR = "src/content/feuilles-match";
const RESULTATS_DIR = "src/content/resultats";
const EQUIPES_DIR = "src/content/equipes";
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
	return lireFrontmatter(mdPath).pdf;
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

/** Lit les équipes de compétition (slug + catégorie d'âge + genre) depuis la
 * collection "equipes", pour le rattachement automatique d'une feuille de
 * match à son équipe (voir detectEquipe() dans src/lib/fdme/equipeMatch.mjs).
 * Lecture directe en `fs`, comme le reste de ce script : il tourne avant le
 * build Astro (voir l'en-tête de ce fichier), `astro:content` n'est donc pas
 * encore disponible. Une équipe sans "categorieAge"/"genre" renseigné
 * (Loisirs, Découverte, Handensemble, créneau transversal) est simplement
 * absente de la liste -- elle ne peut jamais être rattachée automatiquement,
 * ce qui est le comportement voulu. */
function chargerEquipesCompetition() {
	if (!existsSync(EQUIPES_DIR)) return [];
	return readdirSync(EQUIPES_DIR)
		.filter((f) => f.endsWith(".md"))
		.map((f) => lireFrontmatter(join(EQUIPES_DIR, f)))
		.map((data) => ({
			slug: data.slug,
			nom: data.nom,
			categorieAge: data.categorieAge,
			genre: data.genre,
			// Calendriers (url + libelle + repere) : `libelle` sert à distinguer
			// deux équipes du club dans la même catégorie mais des compétitions
			// différentes (voir detecterLibelleCompetition()) ; `repere` sert à
			// reconnaître le camp HBI d'une feuille quand son nom d'équipe n'est
			// pas "Handball Islois" (ex. une entente, voir estNomEquipeHBI()) --
			// les deux dans src/lib/fdme/equipeMatch.mjs.
			calendriers: (data.calendriers ?? []).map((c) => ({ url: c.url, libelle: c.libelle, repere: c.repere })),
		}))
		.filter((e) => e.slug && e.categorieAge && e.genre);
}

/** Feuille redéposée pour un match déjà archivé : si la détection
 * automatique échoue (équipe ou numéro d'équipe vide) mais que l'archive
 * existante avait déjà une valeur corrigée à la main, on la garde plutôt que
 * d'écraser avec du vide. */
function preserverCorrectionsManuelles(cible, data) {
	// Jamais `null` dans le fichier : le schéma exige une chaîne (vide =
	// équipe à rattacher à la main, signalée par le bandeau), sinon le
	// build entier échoue sur une simple équipe non détectée.
	const existant = existsSync(cible) ? lireFrontmatter(cible) : {};
	if (!data.equipeSlug) data.equipeSlug = existant.equipeSlug || "";
	if (!data.equipeNumero && existant.equipeNumero) {
		data.equipeNumero = existant.equipeNumero;
		data.equipeNumeroAmbigu = false;
	}
}

function frontmatter(data) {
	const lignes = ["---"];
	const set = (cle, valeur) => lignes.push(`${cle}: ${JSON.stringify(valeur)}`);

	set("source", "archive");
	set("codeRencontre", data.codeRencontre);
	set("equipeSlug", data.equipeSlug);
	if (data.equipeNumero) set("equipeNumero", data.equipeNumero);
	// Persisté (et pas seulement signalé pendant l'import) : le PDF est
	// consommé juste après, l'avertissement doit survivre aux builds
	// suivants tant que personne n'a renseigné le numéro à la main.
	if (data.equipeNumeroAmbigu) lignes.push("equipeNumeroAVerifier: true");
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
const equipesCompetition = chargerEquipesCompetition();
let ok = 0;
let ignorees = 0;
let consommees = 0;
const codesGeneres = new Set();
/** @type {{ fichier: string, raison: string }[]} */
const erreurs = [];
/** Feuilles importées avec succès mais dont une information n'a pas pu être
 * déterminée automatiquement (ex. laquelle de deux équipes du club, engagées
 * dans des compétitions différentes, a joué -- voir equipeNumeroAmbigu dans
 * src/lib/fdme/parseFeuille.mjs) : signalées séparément de `erreurs`
 * ci-dessus, moins alarmantes qu'un import totalement échoué puisque le
 * résultat est bien publié, juste incomplet.
 * @type {{ fichier: string, raison: string }[]} */
const avertissementsAffiches = [];

// Vérification de configuration, indépendante de toute feuille précise : une
// équipe engagée dans plusieurs compétitions vraiment différentes (urls de
// calendrier distinctes) mais dont moins de deux calendriers ont un
// "Libellé" renseigné ne pourra JAMAIS être distinguée par sous-équipe (voir
// libellesCompetitionIncomplets() dans src/lib/fdme/equipeMatch.mjs) -- pas
// un problème de feuille, mais de la fiche équipe elle-même (c'est ce qui a
// caché 16 résultats U15 masculins jusqu'au 28/09/2026, avant que le second
// calendrier ait son libellé renseigné). Signalé une fois par équipe
// concernée, avant même de traiter la moindre feuille.
for (const equipe of equipesCompetition) {
	if (!libellesCompetitionIncomplets(equipe)) continue;
	avertissementsAffiches.push({
		fichier: `Configuration : fiche équipe « ${equipe.nom} »`,
		raison:
			`Cette équipe a plusieurs calendriers dans des compétitions différentes, mais moins de deux d'entre eux ont un champ "Libellé" renseigné : la distinction par sous-équipe restera impossible pour TOUTE feuille de cette catégorie tant que chacun de ses calendriers actifs (compétitions différentes) n'a pas son propre libellé. Renseignez le champ "Libellé" de chaque calendrier concerné dans la fiche équipe du CMS.`,
	});
}

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
		const data = await parseFeuilleDeMatch(bytes, equipesCompetition);
		const cible = join(RESULTATS_DIR, `pdf-${data.codeRencontre.toLowerCase()}.md`);
		preserverCorrectionsManuelles(cible, data);

		for (const avertissement of data.avertissements) {
			console.warn(`[import-fdme] ${pdfPath} : ${avertissement}`);
		}

		writeFileSync(cible, frontmatter(data), "utf-8");
		codesGeneres.add(`pdf-${data.codeRencontre.toLowerCase()}.md`);
		// Consommation : le résultat est archivé, le PDF (noms et licences en
		// clair) et son entrée CMS n'ont plus de raison d'exister.
		unlinkSync(pdfPath);
		unlinkSync(entryPath);
		consommees++;
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

// Nettoyage (ancien fonctionnement uniquement) : une fiche `source: "pdf"`
// dont la feuille a été supprimée de "Feuilles de match" sans passer par
// la consommation ne doit pas rester indéfiniment. Jamais une archive
// (son PDF a disparu par construction) ni une fiche saisie à la main.
for (const fichier of existsSync(RESULTATS_DIR) ? readdirSync(RESULTATS_DIR) : []) {
	if (!fichier.startsWith("pdf-") || !fichier.endsWith(".md") || codesGeneres.has(fichier)) continue;
	if (lireFrontmatter(join(RESULTATS_DIR, fichier)).source !== "pdf") continue;
	unlinkSync(join(RESULTATS_DIR, fichier));
	console.log(`[import-fdme] ${fichier} supprimé (feuille source disparue).`);
}

// Points à corriger à la main, relus depuis les résultats eux-mêmes et non
// depuis les feuilles traitées dans CE build : une feuille consommée ne
// repasse plus jamais ici, le bandeau doit pourtant rester affiché tant que
// la correction n'est pas faite dans le CMS.
const DATE_COURTE = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" });
for (const fichier of existsSync(RESULTATS_DIR) ? readdirSync(RESULTATS_DIR).filter((f) => f.endsWith(".md")) : []) {
	const r = lireFrontmatter(join(RESULTATS_DIR, fichier));
	if (!r.date) continue;
	const libelle = `${r.codeRencontre ?? fichier} (${r.adversaire ?? "?"}, ${DATE_COURTE.format(new Date(r.date))})`;
	if (!r.equipeSlug) {
		erreurs.push({
			fichier: libelle,
			raison: `Équipe non détectée automatiquement pour la compétition « ${r.competition ?? "?"} ». À corriger dans la collection Résultats du CMS.`,
		});
	} else if (r.equipeNumeroAVerifier && !r.equipeNumero) {
		avertissementsAffiches.push({
			fichier: libelle,
			raison: `Résultat importé, mais impossible de déterminer automatiquement laquelle des équipes du club a joué (compétition « ${r.competition ?? "?"} »). Renseignez le champ "Numéro d'équipe" à la main dans la fiche Résultat.`,
		});
	}
}

writeFileSync(ERREURS_PATH, JSON.stringify({ erreurs, avertissements: avertissementsAffiches }, null, "\t") + "\n", "utf-8");

console.log(
	`[import-fdme] ${ok} feuille(s) importée(s) dont ${consommees} consommée(s) (PDF supprimé), ${ignorees} ignorée(s) sur ${entries.length} déposée(s).`,
);
