// Lancer : npm test (node:test, sans dépendance supplémentaire).
import { test } from "node:test";
import assert from "node:assert/strict";
import { efficacite, efficaciteTri, SEUIL_TIRS_SAISON } from "./efficacite.ts";

test("pourcentage entier, classé à partir du seuil", () => {
	assert.deepEqual(efficacite({ buts: 45, tirs: 73, arrets: 0 }, SEUIL_TIRS_SAISON), { pct: 62, classee: true, detail: "45/73" });
	assert.deepEqual(efficacite({ buts: 1, tirs: 1, arrets: 0 }, SEUIL_TIRS_SAISON), { pct: 100, classee: false, detail: "1/1" });
});

test("aucun chiffre trompeur : 0 tir, tirs < buts, gardien·ne", () => {
	assert.equal(efficacite({ buts: 0, tirs: 0, arrets: 0 }, 5).pct, null);
	assert.equal(efficacite({ buts: 3, tirs: 2, arrets: 0 }, 5).pct, null);
	assert.equal(efficacite({ buts: 1, tirs: 1, arrets: 12 }, 5).pct, null);
	// Un arrêt isolé ne fait pas d'un·e joueur·se de champ un·e gardien·ne.
	assert.equal(efficacite({ buts: 30, tirs: 50, arrets: 1 }, 5).pct, 60);
});

test("hors classement sous le seuil : null au tri", () => {
	assert.equal(efficaciteTri({ buts: 4, tirs: 4, arrets: 0 }, 5), null);
	assert.equal(efficaciteTri({ buts: 4, tirs: 5, arrets: 0 }, 5), 80);
});
