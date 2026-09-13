import { getCollection, type CollectionEntry } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { saisonActuelle } from "./saison";

export type Resultat = CollectionEntry<"resultats">;
export type Issue = "victoire" | "defaite" | "nul";

/** Tous les résultats d'une équipe, du plus récent au plus ancien, toutes
 * saisons confondues -- voir `resultatsParSaison` pour ne garder que la
 * saison en cours et regrouper le reste par saison. */
export async function getResultatsForEquipe(equipeSlug: string): Promise<Resultat[]> {
	const all = await getCollection("resultats");
	return all.filter((r) => r.data.equipeSlug === equipeSlug).sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export interface ResultatsParSaison {
	/** Résultats de la saison en cours (au moment du build), du plus récent
	 * au plus ancien. */
	saisonEnCours: Resultat[];
	/** Saisons passées, de la plus récente à la plus ancienne ; chaque
	 * entrée déjà triée du match le plus récent au plus ancien. */
	saisonsPrecedentes: { saison: string; resultats: Resultat[] }[];
}

/** Sépare les résultats d'une équipe entre la saison en cours (à afficher
 * directement) et les saisons précédentes (archivées, regroupées) --
 * l'effectif d'une équipe change d'une saison à l'autre, afficher un
 * ancien résultat comme s'il concernait l'équipe actuelle serait trompeur. */
export function resultatsParSaison(resultats: Resultat[]): ResultatsParSaison {
	const actuelle = saisonActuelle();
	const saisonEnCours = resultats.filter((r) => r.data.saison === actuelle);

	const groupes = new Map<string, Resultat[]>();
	for (const r of resultats) {
		if (r.data.saison === actuelle) continue;
		if (!groupes.has(r.data.saison)) groupes.set(r.data.saison, []);
		groupes.get(r.data.saison)!.push(r);
	}
	const saisonsPrecedentes = [...groupes.entries()]
		.sort((a, b) => (a[0] < b[0] ? 1 : -1))
		.map(([saison, resultats]) => ({ saison, resultats }));

	return { saisonEnCours, saisonsPrecedentes };
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

export interface GardienAffiche {
	numero: number;
	label: string;
	arrets: number;
}

function libellesAffichage(joueurs: { numero: number; prenom: string; nom: string }[], affichageStats: "nominatif" | "pseudonymise" | "masque") {
	return disambiguateDisplayNames(joueurs, affichageStats);
}

/** Tou·te·s les buteur·se·s du HBI sur ce match (pas seulement un podium :
 * voir un premier but de la saison compte tout autant pour un jeune que
 * d'être dans le trio de tête), classé·e·s par nombre de buts. Libellé
 * d'affichage déjà résolu selon le mode de l'équipe (voir
 * disambiguateDisplayNames) -- `[]` si l'affichage des stats individuelles
 * est désactivé pour cette équipe ou qu'aucun·e joueur·se n'a marqué. */
export function buteurs(r: Resultat, affichageStats: "nominatif" | "pseudonymise" | "masque"): ButeurAffiche[] {
	const joueurs = r.data.statsJoueurs ?? [];
	if (affichageStats === "masque" || joueurs.length === 0) return [];

	const labels = libellesAffichage(joueurs, affichageStats);

	return [...joueurs]
		.filter((j) => j.buts > 0)
		.sort((a, b) => b.buts - a.buts)
		.map((j) => ({ numero: j.numero, label: labels.get(j.numero) ?? `${j.prenom} ${j.nom}`, buts: j.buts, tirs: j.tirs }));
}

/** Gardien·ne·s du HBI ayant fait au moins un arrêt sur ce match -- un
 * gardien n'a pas sa place dans un classement de buteur·se·s, mais sa
 * performance (arrêts) mérite d'être visible tout autant. Repéré via la
 * colonne "Arrets" de la feuille (seul·e·s les gardien·ne·s en ont), pas
 * via un poste explicite qui n'existe pas dans les données extraites. */
export function gardiens(r: Resultat, affichageStats: "nominatif" | "pseudonymise" | "masque"): GardienAffiche[] {
	const joueurs = r.data.statsJoueurs ?? [];
	if (affichageStats === "masque" || joueurs.length === 0) return [];

	const labels = libellesAffichage(joueurs, affichageStats);

	return [...joueurs]
		.filter((j) => j.arrets > 0)
		.sort((a, b) => b.arrets - a.arrets)
		.map((j) => ({ numero: j.numero, label: labels.get(j.numero) ?? `${j.prenom} ${j.nom}`, arrets: j.arrets }));
}
