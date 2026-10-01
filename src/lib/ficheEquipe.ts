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
