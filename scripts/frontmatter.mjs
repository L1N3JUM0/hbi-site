#!/usr/bin/env node
/**
 * Lecture du frontmatter YAML des fichiers Markdown de content collection,
 * partagée par les scripts qui tournent avant `astro build` (voir
 * scripts/import-fdme.mjs et scripts/check-content-images.mjs) -- ces
 * scripts ne peuvent pas utiliser `astro:content` (pas encore disponible à
 * ce stade), et lisaient auparavant chaque champ à coups d'expressions
 * régulières ad hoc (un champ scalaire par ligne). Remplacé par un vrai
 * parseur YAML (js-yaml, déjà une dépendance transitive d'Astro) : plus
 * robuste face aux guillemets, à l'indentation et aux listes imbriquées
 * (ex. `calendriers` d'une équipe) que des regex, pour une donnée qui
 * affecte directement le rattachement des résultats publiés sur le site.
 */
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Lit et parse le frontmatter d'un fichier Markdown de content collection.
 * Ne lève jamais : un frontmatter absent ou mal formé renvoie simplement
 * `{}`, pour laisser l'appelant dégrader proprement (avertissement, entrée
 * ignorée...) plutôt que de faire échouer tout le build. */
export function lireFrontmatter(cheminFichier) {
	let contenu;
	try {
		contenu = readFileSync(cheminFichier, "utf-8");
	} catch {
		return {};
	}
	const correspondance = FRONTMATTER_PATTERN.exec(contenu);
	if (!correspondance) return {};
	try {
		return yaml.load(correspondance[1]) ?? {};
	} catch {
		return {};
	}
}
