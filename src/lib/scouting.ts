/**
 * Lecture des données de scouting générées par
 * scripts/scouting-ffhandball.mjs (src/data/scouting/, ignoré par git) pour
 * les pages src/pages/[scouting]/. Lecture `fs` plutôt qu'import : le
 * dossier est absent quand SCOUTING_SLUG n'est pas défini, ou quand le
 * script a échoué -- les pages affichent alors « données indisponibles ».
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface MatchJoue {
	rencontreId: string;
	date: string | null;
	journee: number | null;
	domicile: boolean;
	adversaire: string;
	forfait: boolean;
	resultat: "V" | "N" | "D";
	butsPour: number | null;
	butsContre: number | null;
}

export interface FicheAdversaire {
	adversaire: string;
	/** Match de coupe : championnat départemental de l'adversaire d'où
	 * viennent forme, classement et buteurs. null en championnat. */
	championnat: { competition: string; comite: string; equipe: string } | null;
	classement: {
		place: number;
		points: number;
		joue: number;
		gagne: number;
		nul: number;
		perdu: number;
		butPlus: number;
		butMoins: number;
		diff: number;
		nbEquipes: number;
	} | null;
	forme: MatchJoue[] | null;
	moyennes: { marques: number; encaisses: number; matchs: number } | null;
	/** Vu par le HBI (butsPour = buts du HBI). */
	aller: MatchJoue | null;
	buteurs: {
		/** La fédération ne publie pas les buteurs de cette catégorie (U13). */
		masques?: boolean;
		/** `numero` : maillot au match le plus récent ; `part` : % des buts
		 * de l'équipe sur les matchs où la personne figure (null si non
		 * calculable). */
		liste: { numero: string | null; nom: string; buts: number; part: number | null; matchs: number }[];
		matchsAnalyses: number;
		matchsDemandes: number;
		partiel: boolean;
	} | null;
	journeesManquantes: number;
}

export interface EquipeScouting {
	/** Segment d'URL de la fiche ("seniors-masculins-1"). */
	id: string;
	equipe: string;
	/** Calendrier de coupe (toute la catégorie), pas de match aller. */
	coupe?: boolean;
	statut: "ok" | "aucun_match" | "indisponible";
	match?: { date: string; domicile: boolean; adversaire: string; journee: string | null; competition: string | null };
	fiche?: FicheAdversaire | null;
}

export interface CategorieScouting {
	id: string;
	libelle: string;
	/** null : fichier absent ou illisible. */
	genereLe: string | null;
	matchs: EquipeScouting[];
}

/** Ordre et libellés fixes : une catégorie dont le fichier manque reste
 * affichée (« données indisponibles ») plutôt que de disparaître. */
const CATEGORIES = [
	{ id: "seniors", libelle: "Seniors" },
	{ id: "u17", libelle: "U17" },
	{ id: "u18", libelle: "U18" },
	{ id: "u15", libelle: "U15" },
	{ id: "u13", libelle: "U13" },
];
const DOSSIER = join(process.cwd(), "src/data/scouting");

/** Segment d'URL des pages, ou null : pas de slug (ou slug douteux), pas
 * de pages du tout. Jamais affiché dans les logs. */
export function segmentScouting(): string | null {
	const slug = process.env.SCOUTING_SLUG ?? "";
	return /^[A-Za-z0-9_-]+$/.test(slug) ? `scouting-${slug}` : null;
}

export function chargerScouting(): CategorieScouting[] {
	return CATEGORIES.map(({ id, libelle }) => {
		const chemin = join(DOSSIER, `${id}.json`);
		try {
			if (!existsSync(chemin)) throw new Error("absent");
			const data = JSON.parse(readFileSync(chemin, "utf-8"));
			return { id, libelle, genereLe: data.genereLe ?? null, matchs: Array.isArray(data.matchs) ? data.matchs : [] };
		} catch {
			return { id, libelle, genereLe: null, matchs: [] };
		}
	});
}

const fmt = (date: Date, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...options }).format(date);

/** "sam. 24 oct. · 20:00" */
export function formatDateMatch(iso: string): string {
	const date = new Date(iso);
	return `${fmt(date, { weekday: "short", day: "numeric", month: "short" })} · ${fmt(date, { hour: "2-digit", minute: "2-digit" })}`;
}

/** "24/10" */
export function formatDateCourte(iso: string | null): string {
	return iso ? fmt(new Date(iso), { day: "2-digit", month: "2-digit" }) : "";
}

/** "17/10 à 19:56" */
export function formatGenereLe(iso: string): string {
	const date = new Date(iso);
	return `${fmt(date, { day: "2-digit", month: "2-digit" })} à ${fmt(date, { hour: "2-digit", minute: "2-digit" })}`;
}

/** "37 – 24", ou "Forfait" quand la fédération n'affiche pas de score. */
export function formatScore(m: MatchJoue): string {
	if (m.forfait) return m.resultat === "V" ? "Victoire par forfait" : "Forfait";
	return `${m.butsPour} – ${m.butsContre}`;
}

const sansAccents = (texte: string) =>
	texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

/** Chemin (sans `base`) de la fiche scouting du prochain match affiché sur
 * /equipes, ou null. Même construction d'identifiant que
 * scripts/scouting-ffhandball.mjs (equipesDeCategorie). On compare aussi
 * l'adversaire : le JSON date du dernier build du script, il ne doit pas
 * envoyer vers la fiche d'un adversaire déjà joué. */
export function cheminScoutingPour(match: { equipeSlugs: string[]; equipeLibelle?: string; coupeDeFrance: boolean; opponent: string | null; isDerby: boolean }): string | null {
	const segment = segmentScouting();
	if (!segment || match.isDerby || !match.opponent || match.equipeSlugs.length !== 1) return null;
	const id = (match.coupeDeFrance ? [match.equipeSlugs[0], "coupe"] : [match.equipeSlugs[0], match.equipeLibelle])
		.filter(Boolean)
		.join("-")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-");
	const trouve = chargerScoutingMemo().flatMap((c) => c.matchs).find((e) => e.id === id && e.fiche && e.match);
	if (!trouve?.match || sansAccents(trouve.match.adversaire) !== sansAccents(match.opponent)) return null;
	return `/${segment}/${id}/`;
}

let memo: CategorieScouting[] | null = null;
/** Lu une seule fois par build : /equipes l'appelle pour chaque fiche. */
function chargerScoutingMemo(): CategorieScouting[] {
	return (memo ??= chargerScouting());
}
