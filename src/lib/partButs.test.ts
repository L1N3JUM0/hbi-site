// Lancer : npm test (node:test, sans dépendance supplémentaire).
import { test } from "node:test";
import assert from "node:assert/strict";
import { partButs, SEUIL_PART_FORTE } from "./partButs.mjs";

test("part des buts : pourcentage entier", () => {
	assert.equal(partButs(14, 76), 18);
	assert.equal(partButs(20, 39), 51);
	assert.ok(partButs(20, 39)! >= SEUIL_PART_FORTE);
	assert.equal(partButs(0, 25), 0);
});

test("jamais de chiffre trompeur", () => {
	assert.equal(partButs(0, 0), null);
	assert.equal(partButs(3, 2), null);
});
