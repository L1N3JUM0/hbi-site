/**
 * Règle de conservation des lignes joueur·se (décision du club, 28/09/2026) :
 * le dépôt est public, donc une personne partie du club depuis plus de
 * 3 saisons complètes ne doit plus figurer DANS LES DONNÉES elles-mêmes,
 * pas seulement être masquée à l'affichage.
 *
 * « 3 saisons complètes d'absence » : dernière saison vue 2022-2023 ->
 * absente en 2023-2024, 2024-2025 et 2025-2026 -> retirée dès 2026-2027.
 * Dernière saison vue 2023-2024 -> retirée à la rentrée 2027-2028. Soit :
 * retirée dès que (début de la saison en cours) - (début de la dernière
 * saison vue) > SAISONS_ABSENCE.
 *
 * Seules les lignes joueur·se sont retirées : score, chronologie (qui ne
 * contient aucun nom) et totaux d'équipe restent intacts -- ils décrivent
 * un match du club, pas une personne.
 *
 * Recalculé à chaque build (voir scripts/retention-joueurs.mjs), jamais une
 * fois pour toutes : une personne conservée aujourd'hui sort d'elle-même le
 * jour où elle franchit le seuil, sans intervention.
 *
 * JavaScript simple (pas de TypeScript), comme saison.mjs : utilisé par un
 * script Node qui tourne avant le build Astro.
 */
import { saisonPour } from "./saison.mjs";

export const SAISONS_ABSENCE = 3;

/** "2025-2026" -> 2025 */
function debutSaison(saison) {
	return Number(saison.slice(0, 4));
}

/**
 * @param {{ date: Date|string, statsJoueurs?: { licenceHash?: string }[] }[]} resultats
 * @param {string} saisonEnCours ex. "2026-2027"
 * @returns {{ derniereSaison: Map<string, number>, estRetire: (resultat: object, ligne: object) => boolean }}
 */
export function regleConservation(resultats, saisonEnCours) {
	const seuil = debutSaison(saisonEnCours) - SAISONS_ABSENCE;
	/** empreinte de licence -> année de début de la dernière saison où elle apparaît */
	const derniereSaison = new Map();
	for (const r of resultats) {
		const debut = debutSaison(saisonPour(new Date(r.date)));
		for (const ligne of r.statsJoueurs ?? []) {
			if (!ligne.licenceHash) continue;
			if ((derniereSaison.get(ligne.licenceHash) ?? -Infinity) < debut) derniereSaison.set(ligne.licenceHash, debut);
		}
	}
	return {
		derniereSaison,
		estRetire(resultat, ligne) {
			// Sans empreinte, impossible de prouver une présence récente : on
			// s'en tient à l'ancienneté du match lui-même.
			const dernierVu = ligne.licenceHash
				? derniereSaison.get(ligne.licenceHash)
				: debutSaison(saisonPour(new Date(resultat.date)));
			return dernierVu < seuil;
		},
	};
}
