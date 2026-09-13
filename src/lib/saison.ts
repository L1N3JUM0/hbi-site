/**
 * Une saison de handball va environ de septembre à juin. On place la
 * bascule au 1er juillet (creux estival, aucun match officiel à cette
 * date) : un match joué en juillet ou après appartient à la saison
 * "année-année+1" qui démarre ; un match joué avant juillet appartient à
 * la saison qui a démarré l'année précédente.
 *
 * Utilisé à la fois pour calculer le champ `saison` de chaque résultat
 * (voir content.config.ts, calculé automatiquement depuis `date` --
 * jamais saisi à la main, jamais périmé si la date est corrigée) et pour
 * déterminer la saison "en cours" au moment du build (voir
 * src/lib/resultats.ts) : comme le site se reconstruit chaque jour (voir
 * .github/workflows/deploy.yml), le basculement d'une saison à l'autre se
 * fait tout seul le moment venu, sans changement de code.
 */
export function saisonPour(date: Date): string {
	const annee = date.getFullYear();
	const mois = date.getMonth() + 1;
	return mois >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

/** La saison en cours à la date donnée (par défaut : maintenant, donc au
 * moment du build). */
export function saisonActuelle(maintenant = new Date()): string {
	return saisonPour(maintenant);
}
