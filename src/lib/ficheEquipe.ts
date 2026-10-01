import type { CollectionEntry } from "astro:content";
import type { AgendaMatch } from "./agenda";
import { jourParis } from "./dateParis";

type Equipe = CollectionEntry<"equipes">;

const PARIS = { timeZone: "Europe/Paris" } as const;

function majuscule(texte: string): string {
	return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** "14h", "14h30" */
export function formatHeureCourte(date: Date): string {
	const [h, m] = new Intl.DateTimeFormat("fr-FR", { ...PARIS, hour: "2-digit", minute: "2-digit" })
		.format(date)
		.split(":");
	return `${Number(h)}h${m === "00" ? "" : m}`;
}

/** "Sam. 3 oct. 14h" -- la date d'abord, pour la ligne "prochain match" de
 * la fiche résumée. */
export function formatDateHeureCourte(date: Date): string {
	const jour = new Intl.DateTimeFormat("fr-FR", { ...PARIS, weekday: "short", day: "numeric", month: "short" }).format(date);
	return `${majuscule(jour)} ${formatHeureCourte(date)}`;
}

/** "Samedi 3 octobre" */
export function formatJourLong(date: Date): string {
	return majuscule(new Intl.DateTimeFormat("fr-FR", { ...PARIS, weekday: "long", day: "numeric", month: "long" }).format(date));
}

export interface JourDeMatchs {
	date: Date;
	matchs: AgendaMatch[];
}

/** Regroupe par jour (heure de Paris) : plusieurs matchs le même jour forment
 * un plateau. Un match reporté sans nouvelle date n'a pas de vrai jour : il
 * forme son propre groupe, en fin de liste. */
export function grouperParJour(matchs: AgendaMatch[]): { jours: JourDeMatchs[]; sansDate: AgendaMatch[] } {
	const jours = new Map<string, JourDeMatchs>();
	const sansDate: AgendaMatch[] = [];
	for (const m of matchs) {
		if (m.reporte && !m.reporte.nouvelleDate) {
			sansDate.push(m);
			continue;
		}
		const cle = jourParis(m.start);
		if (!jours.has(cle)) jours.set(cle, { date: m.start, matchs: [] });
		jours.get(cle)!.matchs.push(m);
	}
	return { jours: [...jours.values()], sansDate };
}

const PUBLIC_PAR_AGE: Record<string, string> = {
	senior: "Adultes",
};

/** Ce que la fiche résumée affiche à la place du prochain match pour un
 * créneau sans calendrier : le champ `public` s'il est rempli, sinon une
 * tranche d'âge déduite de la catégorie ("U9" -> "Moins de 9 ans"). */
export function publicEquipe(equipe: Equipe): string | undefined {
	const { public: publicSaisi, categorieAge } = equipe.data;
	if (publicSaisi) return publicSaisi;
	if (!categorieAge) return undefined;
	if (PUBLIC_PAR_AGE[categorieAge]) return PUBLIC_PAR_AGE[categorieAge];
	const age = /^U(\d+)$/i.exec(categorieAge);
	return age ? `Moins de ${age[1]} ans` : undefined;
}

export type CleGroupe = "ecole" | "u13" | "u15" | "u17-u18" | "seniors" | "decouverte" | "complementaires";

/** Groupes de la page /equipes et de sa barre "Aller à", dans l'ordre
 * d'affichage. `titreBarre` : version courte pour la barre, qui doit tenir
 * sur deux lignes au plus sur desktop -- absent quand les liens se suffisent
 * ("U13 F", "U13 M"). Les titres de section, eux, restent complets. */
export const GROUPES: { cle: CleGroupe; titre: string; titreBarre?: string }[] = [
	{ cle: "ecole", titre: "École de hand", titreBarre: "École de hand" },
	{ cle: "u13", titre: "U13" },
	{ cle: "u15", titre: "U15" },
	{ cle: "u17-u18", titre: "U17 – U18" },
	{ cle: "seniors", titre: "Seniors et loisirs", titreBarre: "Seniors et loisirs" },
	{ cle: "decouverte", titre: "Découverte et inclusion", titreBarre: "Découverte" },
	{ cle: "complementaires", titre: "Créneaux complémentaires", titreBarre: "Compléments" },
];

/** Groupe d'une équipe, déduit de son type et de sa catégorie d'âge -- aucune
 * saisie supplémentaire dans le CMS : une nouvelle catégorie (ex. un futur
 * U20) se range d'elle-même. */
export function groupeEquipe(equipe: Equipe): CleGroupe {
	const { type, categorieAge } = equipe.data;
	if (type === "decouverte" || type === "inclusion") return "decouverte";
	if (type === "transversal") return "complementaires";
	const age = categorieAge ? /^U(\d+)$/i.exec(categorieAge) : null;
	// Sans catégorie d'âge (Loisirs) ou "senior" : adultes.
	if (!age) return "seniors";
	const n = Number(age[1]);
	if (n <= 11) return "ecole";
	if (n <= 13) return "u13";
	if (n <= 15) return "u15";
	if (n <= 18) return "u17-u18";
	return "seniors";
}

/** Libellé court pour la barre "Aller à" : "U13 F", "Seniors M", sinon le
 * nom ("Loisirs", "Baby Hand"). Le nom complet reste en infobulle (title) :
 * le lien garde le texte visible comme nom accessible. */
export function libelleCourtEquipe(equipe: Equipe): string {
	const { nom, categorieAge, genre } = equipe.data;
	if (!categorieAge) return nom.split(/[,&]/)[0].trim();
	const lettre = genre === "feminin" ? " F" : genre === "masculin" ? " M" : "";
	return `${categorieAge === "senior" ? "Seniors" : categorieAge.toUpperCase()}${lettre}`;
}
