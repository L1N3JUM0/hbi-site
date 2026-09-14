import { getCollection, type CollectionEntry } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { normaliserTexte } from "./fdme/equipeMatch.mjs";
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

/** true si plusieurs équipes du club sont distinguées dans ces résultats (ex.
 * Seniors masculins 1 et 2, qui partagent le même `equipeSlug` mais jouent
 * dans des feuilles de match différentes) -- déterminé directement depuis les
 * données, jamais depuis une configuration séparée à maintenir à jour.
 *
 * Un seul `equipeNumero` non vide (même une seule fois, même toujours la
 * même valeur, ex. toujours "2") suffit à le détecter : une équipe seule
 * dans sa catégorie n'a JAMAIS de numéro sur ses feuilles de match (son nom y
 * reste "HANDBALL ISLOIS" sans suffixe -- voir extraireNumeroEquipe() dans
 * src/lib/fdme/equipeMatch.mjs), donc la moindre apparition d'un numéro
 * prouve à elle seule qu'une deuxième équipe existe, même si cette dernière
 * n'a par ailleurs jamais explicitement le numéro "1" sur ses propres
 * feuilles (le cas le plus courant : seule l'équipe SUIVANTE porte un
 * suffixe). Constaté en pratique : les feuilles "U13 masculins" ne portent
 * jamais explicitement de "1", seulement parfois un "2" (équipe Honneur
 * engagée en parallèle) -- exiger deux valeurs distinctes aurait laissé ce
 * cas passer inaperçu.
 *
 * Reste vrai pour les archives même si le partage de poule s'arrête plus
 * tard (calculé sur TOUS les résultats de l'équipe, toutes saisons
 * confondues) ; ne fait jamais apparaître de numéro pour une catégorie qui
 * n'a jamais eu de deuxième équipe (voir ResultatMatch.astro, qui n'affiche
 * le badge "Équipe N" que si ceci est vrai). */
export function aPlusieursEquipes(resultats: Resultat[]): boolean {
	return resultats.some((r) => !!r.data.equipeNumero);
}

/** "Équipe {numero}" pour un numéro classique de partage de poule (ex.
 * Seniors 1/2) ; le libellé tel quel, sans le mot "Équipe" devant, pour un
 * libellé libre (deux équipes engagées dans des compétitions différentes,
 * ex. "Excellence"/"Départemental" -- voir detecterLibelleCompetition() dans
 * src/lib/fdme/equipeMatch.mjs). Règle de présentation unique, partagée par
 * le badge de ResultatMatch.astro et les en-têtes de groupe ci-dessous --
 * jamais dupliquée pour ne pas risquer de diverger. */
export function libelleEquipeAffiche(numero: string | null | undefined): string {
	const valeur = numero || "1";
	return /^\d+$/.test(valeur) ? `Équipe ${valeur}` : valeur;
}

export interface GroupeIdentite {
	/** Clé de regroupement normalisée (casse/accents ignorés, voir
	 * normaliserTexte() dans src/lib/fdme/equipeMatch.mjs) -- deux résultats
	 * dont le `equipeNumero` ne diffère que par la casse ou les accents
	 * (ex. "Excellence" saisi automatiquement vs "excellence" retapé à la
	 * main sur un résultat de secours) rejoignent le même groupe. */
	cle: string;
	/** Libellé à afficher : celui du calendrier ACTUEL de l'équipe qui
	 * correspond à cette clé quand il existe -- source de vérité unique,
	 * pour qu'un résultat saisi avec une casse différente affiche quand même
	 * le libellé "officiel" du CMS plutôt que sa propre graphie. Sinon (clé
	 * absente des calendriers actuels : partage de poule qui a cessé,
	 * calendrier remplacé à la saison suivante...), le libellé tel qu'il
	 * apparaît dans les résultats eux-mêmes. */
	libelle: string;
}

/**
 * Ordre canonique des groupes d'équipes pour une catégorie qui en compte
 * plusieurs (voir `aPlusieursEquipes`) -- calculé UNE fois sur l'ensemble
 * des résultats connus de l'équipe (toutes saisons confondues) et sur ses
 * calendriers actuels, pour que la saison en cours et les archives utilisent
 * exactement le même ordre et les mêmes libellés (voir `grouperResultats`
 * ci-dessous, qui répartit ensuite un sous-ensemble de résultats selon cet
 * ordre).
 *
 * 1. D'abord les équipes déclarées dans les calendriers actuels de la fiche
 *    équipe, dans leur ordre de déclaration dans le CMS (reflète
 *    l'intention du club, ex. "Excellence" avant "Départemental").
 * 2. Puis toute clé observée dans les résultats mais absente des
 *    calendriers actuels (catégorie dont le partage de poule a cessé,
 *    calendrier remplacé à la saison suivante...), triée numériquement
 *    d'abord (Équipe 1, Équipe 2...), puis alphabétiquement.
 */
export function ordreGroupesEquipe(tousLesResultats: Resultat[], calendriers: { libelle?: string }[]): GroupeIdentite[] {
	const groupes = new Map<string, GroupeIdentite>();

	for (const cal of calendriers) {
		const brut = cal.libelle?.trim();
		if (!brut) continue;
		const cle = normaliserTexte(brut);
		if (!groupes.has(cle)) groupes.set(cle, { cle, libelle: libelleEquipeAffiche(brut) });
	}

	const restants: GroupeIdentite[] = [];
	for (const r of tousLesResultats) {
		const cle = normaliserTexte(r.data.equipeNumero || "1");
		if (groupes.has(cle) || restants.some((g) => g.cle === cle)) continue;
		restants.push({ cle, libelle: libelleEquipeAffiche(r.data.equipeNumero) });
	}
	restants.sort((a, b) => {
		const na = Number(a.cle);
		const nb = Number(b.cle);
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
		if (!Number.isNaN(na)) return -1;
		if (!Number.isNaN(nb)) return 1;
		return a.libelle.localeCompare(b.libelle, "fr");
	});

	return [...groupes.values(), ...restants];
}

export interface GroupeResultats extends GroupeIdentite {
	resultats: Resultat[];
}

/** Répartit un sous-ensemble de résultats (ex. la saison en cours, ou une
 * saison archivée) selon l'ordre canonique de `ordreGroupesEquipe` -- ne
 * garde que les groupes non vides pour ce sous-ensemble précis. */
export function grouperResultats(resultats: Resultat[], ordre: GroupeIdentite[]): GroupeResultats[] {
	return ordre
		.map((groupe) => ({
			...groupe,
			resultats: resultats.filter((r) => normaliserTexte(r.data.equipeNumero || "1") === groupe.cle),
		}))
		.filter((g) => g.resultats.length > 0);
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
 * du HBI, quel que soit le camp qu'il occupait sur ce match. `null` pour un
 * forfait (pas de score, voir `forfait` dans content.config.ts) ou toute
 * entrée manuelle où l'un des deux scores manquerait. */
export function scoreNousEux(r: Resultat): { nous: number; eux: number } | null {
	const { domicile, scoreDomicile, scoreExterieur } = r.data;
	if (scoreDomicile == null || scoreExterieur == null) return null;
	return domicile ? { nous: scoreDomicile, eux: scoreExterieur } : { nous: scoreExterieur, eux: scoreDomicile };
}

export function issueDuMatch(r: Resultat): Issue {
	// Un forfait n'a pas de score à comparer : le camp qui a déclaré forfait
	// a perdu, sans ambiguïté possible.
	if (r.data.forfait === "nous") return "defaite";
	if (r.data.forfait === "adversaire") return "victoire";
	const score = scoreNousEux(r);
	if (!score) return "nul"; // score manquant sur une entrée manuelle -- ne devrait pas arriver, garde-fou.
	if (score.nous > score.eux) return "victoire";
	if (score.nous < score.eux) return "defaite";
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
