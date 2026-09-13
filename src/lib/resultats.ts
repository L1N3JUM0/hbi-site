import { getCollection, type CollectionEntry } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";

export type Resultat = CollectionEntry<"resultats">;
export type Issue = "victoire" | "defaite" | "nul";

/** Tous les résultats d'une équipe, du plus récent au plus ancien. */
export async function getResultatsForEquipe(equipeSlug: string): Promise<Resultat[]> {
	const all = await getCollection("resultats");
	return all.filter((r) => r.data.equipeSlug === equipeSlug).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Score domicile/extérieur remis dans l'ordre "nous/eux" du point de vue
 * du HBI, quel que soit le camp qu'il occupait sur ce match. */
export function scoreNousEux(r: Resultat): { nous: number; eux: number } {
	return r.data.domicile ? { nous: r.data.scoreDomicile, eux: r.data.scoreExterieur } : { nous: r.data.scoreExterieur, eux: r.data.scoreDomicile };
}

export function issueDuMatch(r: Resultat): Issue {
	const { nous, eux } = scoreNousEux(r);
	if (nous > eux) return "victoire";
	if (nous < eux) return "defaite";
	return "nul";
}

/** Stats d'équipe du HBI sur ce match (jamais celles de l'adversaire). */
export function statsEquipeNous(r: Resultat) {
	return r.data.domicile ? r.data.statsEquipeDomicile : r.data.statsEquipeExterieur;
}

export function efficaciteTir(buts: number, tirs: number): number | null {
	if (!tirs) return null;
	return Math.round((buts / tirs) * 100);
}

export function formatDateCourte(date: Date): string {
	const label = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }).format(date);
	return label;
}

function tempsEnSecondes(temps: string): number | null {
	const m = /^(\d{2}):(\d{2})$/.exec(temps);
	if (!m) return null;
	return Number(m[1]) * 60 + Number(m[2]);
}

export interface CourbeScore {
	width: number;
	height: number;
	pathNous: string;
	pathEux: string;
}

/** Calcule le tracé SVG (chemins "nous"/"eux") de l'évolution du score sur
 * la durée du match, à partir de la chronologie. `null` si aucun point
 * horodaté n'est exploitable (feuille sans chronologie, ou résultat saisi
 * à la main). */
export function courbeScore(r: Resultat, width = 300, height = 80, padding = 4): CourbeScore | null {
	const events = r.data.chronologie ?? [];
	const points = events
		.map((e) => {
			const t = tempsEnSecondes(e.temps);
			if (t === null) return null;
			const { nous, eux } = r.data.domicile
				? { nous: e.scoreDomicile, eux: e.scoreExterieur }
				: { nous: e.scoreExterieur, eux: e.scoreDomicile };
			return { t, nous, eux };
		})
		.filter((p): p is { t: number; nous: number; eux: number } => p !== null);

	if (points.length < 2) return null;

	const maxT = Math.max(...points.map((p) => p.t)) || 1;
	const maxScore = Math.max(...points.map((p) => Math.max(p.nous, p.eux)), 1);
	const scaleX = (t: number) => padding + (t / maxT) * (width - 2 * padding);
	const scaleY = (s: number) => height - padding - (s / maxScore) * (height - 2 * padding);
	const toPath = (key: "nous" | "eux") =>
		points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.t).toFixed(1)} ${scaleY(p[key]).toFixed(1)}`).join(" ");

	return { width, height, pathNous: toPath("nous"), pathEux: toPath("eux") };
}

export interface ButeurAffiche {
	numero: number;
	label: string;
	buts: number;
	tirs: number;
}

/** Meilleur·e·s buteur·se·s du HBI sur ce match, avec leur libellé
 * d'affichage déjà résolu selon le mode de l'équipe (voir
 * disambiguateDisplayNames) -- `[]` si l'affichage des stats individuelles
 * est désactivé pour cette équipe ou qu'aucun·e joueur·se n'a marqué. */
export function meilleursButeurs(r: Resultat, affichageStats: "nominatif" | "pseudonymise" | "masque", limite = 3): ButeurAffiche[] {
	const joueurs = r.data.statsJoueurs ?? [];
	if (affichageStats === "masque" || joueurs.length === 0) return [];

	const labels = disambiguateDisplayNames(
		joueurs.map((j) => ({ numero: j.numero, prenom: j.prenom, nom: j.nom })),
		affichageStats,
	);

	return [...joueurs]
		.filter((j) => j.buts > 0)
		.sort((a, b) => b.buts - a.buts)
		.slice(0, limite)
		.map((j) => ({ numero: j.numero, label: labels.get(j.numero) ?? `${j.prenom} ${j.nom}`, buts: j.buts, tirs: j.tirs }));
}
