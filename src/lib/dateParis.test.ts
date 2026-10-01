// Lancer : npm test (node:test, sans dépendance supplémentaire).
import { test } from "node:test";
import assert from "node:assert/strict";
import yaml from "js-yaml";
import { lireDateParis } from "./dateParis.ts";

/** Lit une valeur comme Astro lit un frontmatter écrit par Sveltia : le YAML
 * la transforme en `Date` (lue comme UTC) avant même le schéma -- c'est
 * exactement le chemin qui décalait le loto de 2 h. */
function depuisFrontmatter(ligne: string): unknown {
	return (yaml.load(ligne) as { date: unknown }).date;
}

const cas = [
	{ nom: "heure d'été (11 octobre, UTC+2)", saisie: "2026-10-11T14:30:00", utc: "2026-10-11T12:30:00.000Z" },
	{ nom: "heure d'hiver (15 décembre, UTC+1)", saisie: "2026-12-15T14:30:00", utc: "2026-12-15T13:30:00.000Z" },
	{ nom: "jour du passage à l'heure d'hiver (25 octobre)", saisie: "2026-10-25T14:30:00", utc: "2026-10-25T13:30:00.000Z" },
];

for (const { nom, saisie, utc } of cas) {
	test(`frontmatter non cité, ${nom}`, () => {
		const brut = depuisFrontmatter(`date: ${saisie}`);
		assert.ok(brut instanceof Date, "le YAML doit bien produire un Date");
		assert.equal(lireDateParis(brut)?.toISOString(), utc);
	});
	test(`texte sans fuseau, ${nom}`, () => {
		assert.equal(lireDateParis(saisie)?.toISOString(), utc);
	});
}

test("date seule (dateOrigine d'un match reporté) : reste le même jour à Paris", () => {
	const brut = depuisFrontmatter("date: 2026-10-10");
	assert.equal(lireDateParis(brut)?.toISOString(), "2026-10-09T22:00:00.000Z");
});

test("texte avec fuseau explicite : respecté tel quel", () => {
	assert.equal(lireDateParis("2026-10-11T14:30:00+02:00")?.toISOString(), "2026-10-11T12:30:00.000Z");
});

test("valeurs illisibles : undefined", () => {
	assert.equal(lireDateParis("pas une date"), undefined);
	assert.equal(lireDateParis(new Date(Number.NaN)), undefined);
	assert.equal(lireDateParis(null), undefined);
});
