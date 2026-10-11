/**
 * Efficacité au tir (buts ÷ tirs) d'une ligne de statistiques : un total de
 * saison, de carrière ou d'un seul match. Module sans dépendance Astro : il
 * sert aussi au script navigateur du détail match par match de
 * /statistiques.
 */

/** Tirs minimum pour qu'une efficacité compte au classement (décision du
 * 11/10/2026). Sous ce seuil, la valeur reste affichée mais atténuée, et
 * passe en fin de tri quel que soit le sens : sinon 1 but sur 1 tir (100 %)
 * dominerait un·e buteur·se à 120 sur 200. Ordres de grandeur des feuilles
 * importées : médiane de 20 tirs sur une saison, de 36 sur une carrière. */
export const SEUIL_TIRS_CARRIERE = 10;
export const SEUIL_TIRS_SAISON = 5;

type Ligne = { buts: number; tirs: number; arrets: number };

/** Gardien·ne, déduit des chiffres : la feuille de match ne dit pas qui joue
 * dans les buts. Plus d'arrêts que de tirs sur la période distingue un·e
 * gardien·ne d'un·e joueur·se de champ crédité·e d'un arrêt isolé. */
export function estGardien(l: Ligne): boolean {
	return l.arrets > l.tirs;
}

export type Efficacite =
	| { pct: number; classee: boolean; detail: string }
	| { pct: null; raison: "aucun tir" | "gardien" | "donnée incohérente" };

/** `pct` en pourcentage entier, ou `null` quand un chiffre serait trompeur :
 * aucun tir, gardien·ne, ou plus de buts que de tirs (feuille mal remplie --
 * jamais un « 150 % » affiché). `classee` : au moins `seuil` tirs. */
export function efficacite(l: Ligne, seuil: number): Efficacite {
	if (estGardien(l)) return { pct: null, raison: "gardien" };
	if (l.tirs === 0) return { pct: null, raison: "aucun tir" };
	if (l.tirs < l.buts) return { pct: null, raison: "donnée incohérente" };
	return { pct: Math.round((l.buts / l.tirs) * 100), classee: l.tirs >= seuil, detail: `${l.buts}/${l.tirs}` };
}

/** Valeur de tri : `null` (fin de tri dans les deux sens) pour une
 * efficacité absente ou sous le seuil. */
export function efficaciteTri(l: Ligne, seuil: number): number | null {
	const e = efficacite(l, seuil);
	return e.pct !== null && e.classee ? e.pct : null;
}

/** Texte d'infobulle, toujours explicite sur ce qui manque. */
export function titreEfficacite(e: Efficacite, seuil: number): string {
	if (e.pct === null) {
		if (e.raison === "gardien") return "Gardien·ne : efficacité au tir non calculée";
		if (e.raison === "aucun tir") return "Aucun tir";
		return "Plus de buts que de tirs sur la feuille : donnée incohérente";
	}
	const base = `${e.detail.replace("/", " buts sur ")} tirs`;
	return e.classee ? base : `${base} -- moins de ${seuil} tirs, hors classement`;
}
