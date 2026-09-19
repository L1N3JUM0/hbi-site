import { getCollection } from "astro:content";

export interface Evenement {
	id: string;
	titre: string;
	start: Date;
	lieu?: string;
	description?: string;
	lien?: string;
}

/** Les événements du club à venir, du plus proche au plus lointain. Même
 * règle que les matchs (voir getAgendaMatches) : un événement déjà commencé
 * n'est plus "à venir", il quitte donc la liste au premier build après son
 * heure de début -- le site est reconstruit chaque jour. */
export async function getUpcomingEvenements(): Promise<Evenement[]> {
	const now = new Date();
	const evenements = await getCollection("evenements");
	return evenements
		.filter((e) => e.data.date >= now)
		.map((e) => ({
			id: e.id,
			titre: e.data.titre,
			start: e.data.date,
			lieu: e.data.lieu,
			description: e.data.description,
			lien: e.data.lien,
		}))
		.sort((a, b) => a.start.getTime() - b.start.getTime());
}
