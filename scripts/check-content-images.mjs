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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const contentDir = "src/content";
const imageLinePattern = /^\s*(?:-\s*)?(?:[a-zA-Z]+:\s*)?"?([^"\n]+\.(?:jpe?g|png|webp|svg|gif))"?\s*$/i;

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

function extractImagePaths(frontmatter) {
	const paths = [];
	for (const line of frontmatter.split("\n")) {
		const match = line.match(imageLinePattern);
		if (match && !match[1].includes("://")) {
			paths.push(match[1].trim());
		}
	}
	return paths;
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
	const text = readFileSync(file, "utf-8");
	const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);
	if (!frontmatterMatch) continue;
	for (const rawPath of extractImagePaths(frontmatterMatch[1])) {
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
