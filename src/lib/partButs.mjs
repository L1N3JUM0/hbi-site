/**
 * Part des buts de l'équipe marqués par un·e joueur·se (demande du
 * 19/10/2026) : son poids réel dans le score. Calculée sur les seuls matchs
 * où la personne figure sur la feuille -- une absence (blessure, autre
 * catégorie) ne doit pas faire baisser sa part.
 *
 * Module JavaScript simple, sans dépendance Astro : partagé par les pages de
 * statistiques et par scripts/scouting-ffhandball.mjs (node pur, avant le
 * build).
 */

/** À partir de cette part, la personne pèse au moins la moitié des buts de
 * son équipe : mise en avant (« à surveiller » côté scouting). */
export const SEUIL_PART_FORTE = 50;

/** Pourcentage entier, ou null quand il serait trompeur : aucun but
 * d'équipe, ou plus de buts que l'équipe (feuille incohérente). */
export function partButs(buts, butsEquipe) {
	if (!butsEquipe || butsEquipe <= 0 || buts > butsEquipe) return null;
	return Math.round((buts / butsEquipe) * 100);
}

