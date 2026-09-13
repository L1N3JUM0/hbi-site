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
 *
 * Lit l'année/le mois en heure française (`Intl`, pas `getFullYear()`/
 * `getMonth()`) : ces deux méthodes lisent le fuseau horaire de la machine
 * qui exécute le code, qui peut différer de la France (le runner GitHub
 * Actions tourne en UTC) -- un `date` minuit-2h du matin heure de Paris
 * tomberait alors sur le mauvais jour calendaire une fois relu en UTC. Même
 * classe de bug que celle corrigée dans parseFeuille.mjs (heure d'un match
 * dépendante du fuseau horaire de la machine qui importe la feuille) : voir
 * l'incident de septembre 2026.
 */
const ANNEE_MOIS_PARIS = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", year: "numeric", month: "numeric" });

export function saisonPour(date: Date): string {
	const parties = Object.fromEntries(ANNEE_MOIS_PARIS.formatToParts(date).map((p) => [p.type, p.value]));
	const annee = Number(parties.year);
	const mois = Number(parties.month);
	return mois >= 7 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}

/** La saison en cours à la date donnée (par défaut : maintenant, donc au
 * moment du build). */
export function saisonActuelle(maintenant = new Date()): string {
	return saisonPour(maintenant);
}
