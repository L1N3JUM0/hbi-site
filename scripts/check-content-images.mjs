#!/usr/bin/env node
/**
 * Vérifie que toutes les images référencées dans src/content/ (équipes,
 * articles, partenaires, page "Le club"...) pointent bien vers un fichier
 * qui existe réellement dans src/assets/.
 *
 * Sert de garde-fou avant `astro build` : un chemin d'image cassé écrit par
 * erreur (typiquement par le CMS) fait planter TOUT le build avec une
 * erreur Astro peu explicite (voir l'incident du 13/09/2026 -- un chemin
 * "src/assets/x.png" sans préfixe, non résolvable, a fait échouer le
 * déploiement complet). Ce script échoue vite, avec un message clair
 * listant tous les problèmes d'un coup, avant même de lancer Astro.
 *
 * Lancé automatiquement avant `npm run build` (script "prebuild" dans
 * package.json). Peut aussi être lancé seul : `node scripts/check-content-images.mjs`.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { lireFrontmatter } from "./frontmatter.mjs";

const contentDir = "src/content";
const IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|svg|gif)$/i;

function listMarkdownFiles(dir) {
	const files = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			files.push(...listMarkdownFiles(full));
		} else if (extname(entry) === ".md") {
			files.push(full);
		}
	}
	return files;
}

/** Parcourt récursivement les valeurs du frontmatter parsé (peu importe le
 * nom du champ ou son imbrication -- texte simple, liste `galerie`, entrée
 * de liste `calendriers`...) et retient celles qui ressemblent à un chemin
 * d'image locale, pour vérifier qu'elles existent vraiment sur le disque. */
function extractImagePaths(valeur, chemins = []) {
	if (typeof valeur === "string") {
		if (IMAGE_EXTENSION_PATTERN.test(valeur) && !valeur.includes("://")) chemins.push(valeur.trim());
	} else if (Array.isArray(valeur)) {
		for (const item of valeur) extractImagePaths(item, chemins);
	} else if (valeur && typeof valeur === "object") {
		for (const item of Object.values(valeur)) extractImagePaths(item, chemins);
	}
	return chemins;
}

/** Même logique que normalizeImagePath() dans src/content.config.ts --
 * doit rester synchronisée avec elle. */
function normalize(value) {
	const isAbsolute = value.startsWith("/");
	const isRelative = value.startsWith(".");
	if (isAbsolute || isRelative) return value;
	return `../../assets/${value.split("/").pop()}`;
}

function resolvePath(file, normalized) {
	if (normalized.startsWith("/")) {
		return join(process.cwd(), normalized.slice(1));
	}
	return join(dirname(file), normalized);
}

const problems = [];
for (const file of listMarkdownFiles(contentDir)) {
	const data = lireFrontmatter(file);
	for (const rawPath of extractImagePaths(data)) {
		const resolved = resolvePath(file, normalize(rawPath));
		if (!existsSync(resolved)) {
			problems.push({ file, rawPath, resolved });
		}
	}
}

if (problems.length > 0) {
	console.error(`\n✗ ${problems.length} image(s) introuvable(s) dans src/content/ :\n`);
	for (const { file, rawPath, resolved } of problems) {
		console.error(`  ${file}\n    chemin : "${rawPath}"\n    attendu ici : ${resolved}\n`);
	}
	console.error(
		'Corrigez ces champs (via /admin ou directement le fichier) avant de builder.\nFormat attendu : un chemin relatif au fichier .md, ex. "../../assets/nom-du-fichier.jpg".',
	);
	process.exit(1);
}

console.log(`✓ Toutes les images référencées dans ${contentDir}/ existent.`);
