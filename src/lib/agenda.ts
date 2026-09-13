import ical from "node-ical";
import type { VEvent } from "node-ical";
import { getCollection } from "astro:content";

export interface AgendaTeamConfig {
	/** Nom affiché sur le site (page /equipes, page /agenda) : le nom de
	 * l'équipe, complété par son "libelle" (ex. "1"/"2") si plusieurs
	 * équipes du club partagent la même poule. */
	nomAffiche: string;
	/** `slug` de l'entrée correspondante dans la collection "equipes". */
	equipeSlug: string;
	/** Flux iCal officiel FFHandball de la compétition (peut être partagé par
	 * plusieurs équipes du club engagées dans la même poule). */
	urlIcs: string;
	/** Texte tel qu'il apparaît dans les résumés d'événements du flux pour
	 * repérer CETTE équipe précisément. Comparaison insensible à la casse. */
	matchLabel: string;
	/** Lien vers le classement de la compétition, si renseigné à la main
	 * dans le CMS (sinon déduit automatiquement de l'URL des rencontres). */
	urlClassement?: string;
}

export interface AgendaMatch {
	id: string;
	/** equipeSlug(s) impliqué(s) dans ce match (deux en cas de derby interne
	 * au club). Sert à filtrer les matchs d'une équipe précise. */
	equipeSlugs: string[];
	/** Nom d'affichage de l'équipe HBI concernée, ou "Équipe A vs Équipe B"
	 * quand deux équipes du club se rencontrent (derby interne). */
	teamLabel: string;
	/** Nom de l'adversaire, ou null pour un derby interne au club. */
	opponent: string | null;
	isDerby: boolean;
	isHome: boolean;
	start: Date;
	location: string;
	matchUrl?: string;
	/** Flux iCal d'origine (pour le bouton "Ajouter à mon agenda"). */
	icsUrl: string;
	classementUrl?: string;
	/** Numéro de journée de championnat, extrait de la description de
	 * l'événement iCal quand le flux le fournit (ex: "Journée 3"). Sert à
	 * regrouper de façon fiable les matchs d'une même journée. */
	journee: number | null;
}

export interface Competition {
	label: string;
	icsUrl: string;
	classementUrl?: string;
}

const CLUB_PATTERN = /handball\s*islois/i;
const HOME_LOCATION_PATTERN = /emile avy/i;
const JOURNEE_PATTERN = /journ[ée]e\s*(\d+)/i;

/** Nombre de jours d'écart maximum entre deux matchs d'une même compétition
 * pour les considérer comme faisant partie de la même journée, quand le
 * flux iCal ne fournit pas de numéro de journée exploitable. Une journée de
 * championnat s'étale généralement sur un week-end (samedi + dimanche),
 * parfois avec un match avancé au vendredi ou reporté au lundi. */
const FALLBACK_MATCHDAY_WINDOW_DAYS = 3;

function parseJournee(description: string): number | null {
	const match = JOURNEE_PATTERN.exec(description);
	return match ? Number(match[1]) : null;
}

function textValue(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object" && "val" in (value as Record<string, unknown>)) {
		return String((value as { val: unknown }).val ?? "");
	}
	return String(value);
}

function splitTeams(summary: string): [string, string] | null {
	const vsParts = summary.split(/\s+vs\s+/i);
	if (vsParts.length === 2) return [vsParts[0].trim(), vsParts[1].trim()];
	const dashParts = summary.split(/\s+-\s+/);
	if (dashParts.length === 2) return [dashParts[0].trim(), dashParts[1].trim()];
	return null;
}

/** Les URLs de rencontre FFHandball se terminent par /rencontre-<id>/ ; le
 * reste du chemin identifie la poule et sert de page de classement. */
function derivePouleUrl(matchUrl: string | undefined): string | undefined {
	if (!matchUrl) return undefined;
	const stripped = matchUrl.replace(/rencontre-[^/]+\/?$/i, "");
	return stripped !== matchUrl ? stripped : undefined;
}

interface FeedEvent {
	uid: string;
	start: Date;
	summary: string;
	location: string;
	matchUrl?: string;
	journee: number | null;
}

interface FeedData {
	events: FeedEvent[];
	calendarName?: string;
}

const feedCache = new Map<string, Promise<FeedData>>();

/** Récupère et parse un flux iCal. Ne lève jamais : un flux indisponible ou
 * mal formé renvoie simplement une liste vide, pour ne jamais casser le build. */
async function fetchFeed(url: string): Promise<FeedData> {
	let cached = feedCache.get(url);
	if (!cached) {
		cached = (async (): Promise<FeedData> => {
			try {
				const res = await fetch(url);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const text = await res.text();
				const data = ical.parseICS(text);

				const events = Object.values(data)
					.filter((item): item is VEvent => item?.type === "VEVENT")
					.map((event) => ({
						uid: event.uid,
						start: event.start,
						summary: textValue(event.summary),
						location: textValue(event.location),
						matchUrl: event.url,
						journee: parseJournee(textValue(event.description)),
					}));

				const rawName = (data.vcalendar as { name?: string } | undefined)?.name;
				const calendarName = rawName?.replace(/^Matchs de .+? dans /i, "");

				return { events, calendarName };
			} catch (error) {
				console.warn(`[agenda] Flux iCal indisponible ou invalide (${url}) :`, error);
				return { events: [] };
			}
		})();
		feedCache.set(url, cached);
	}
	return cached;
}

let agendaTeamsPromise: Promise<AgendaTeamConfig[]> | null = null;

/** Aplatit les `calendriers` de chaque équipe active de la collection
 * "equipes" en une liste d'équipes d'agenda -- remplace l'ancien
 * src/data/agenda-teams.config.ts, désormais éditable depuis le CMS (voir
 * content.config.ts). Une équipe archivée (voir champ `statut`) n'apparaît
 * jamais ici, même si son ancien calendrier n'a pas été vidé : une équipe
 * qui s'arrête n'a plus de matchs à venir. Mise en cache (comme fetchFeed
 * ci-dessus) : la collection ne change pas en cours de build. */
export async function getAgendaTeams(): Promise<AgendaTeamConfig[]> {
	if (!agendaTeamsPromise) {
		agendaTeamsPromise = (async (): Promise<AgendaTeamConfig[]> => {
			const equipes = await getCollection("equipes");
			const teams: AgendaTeamConfig[] = [];
			for (const equipe of equipes) {
				if (equipe.data.statut === "archivee") continue;
				for (const cal of equipe.data.calendriers) {
					teams.push({
						nomAffiche: cal.libelle ? `${equipe.data.nom} ${cal.libelle}`.trim() : equipe.data.nom,
						equipeSlug: equipe.data.slug,
						urlIcs: cal.url,
						matchLabel: cal.repere,
						urlClassement: cal.classementUrl,
					});
				}
			}
			return teams;
		})();
	}
	return agendaTeamsPromise;
}

async function groupTeamsByFeed(): Promise<Map<string, AgendaTeamConfig[]>> {
	const teams = await getAgendaTeams();
	const byUrl = new Map<string, AgendaTeamConfig[]>();
	for (const team of teams) {
		const list = byUrl.get(team.urlIcs) ?? [];
		list.push(team);
		byUrl.set(team.urlIcs, list);
	}
	return byUrl;
}

export async function getAgendaMatches(): Promise<AgendaMatch[]> {
	const now = new Date();
	const matches: AgendaMatch[] = [];

	for (const [url, teams] of await groupTeamsByFeed()) {
		const { events } = await fetchFeed(url);
		if (events.length === 0) continue;

		const classementUrl =
			teams.find((t) => t.urlClassement)?.urlClassement ??
			derivePouleUrl(events.find((e) => e.matchUrl)?.matchUrl);

		for (const event of events) {
			if (event.start < now) continue;
			if (!CLUB_PATTERN.test(event.summary)) continue;

			const sides = splitTeams(event.summary);
			if (!sides) continue;
			const [sideA, sideB] = sides;

			const matchedA = teams.find((t) => sideA.toLowerCase().includes(t.matchLabel.toLowerCase()));
			const matchedB = teams.find((t) => sideB.toLowerCase().includes(t.matchLabel.toLowerCase()));

			const base = {
				id: event.uid,
				start: event.start,
				location: event.location,
				matchUrl: event.matchUrl,
				icsUrl: url,
				classementUrl,
				journee: event.journee,
			};

			if (matchedA && matchedB) {
				matches.push({
					...base,
					equipeSlugs: [matchedA.equipeSlug, matchedB.equipeSlug],
					teamLabel: `${matchedA.nomAffiche} vs ${matchedB.nomAffiche}`,
					opponent: null,
					isDerby: true,
					isHome: HOME_LOCATION_PATTERN.test(event.location),
				});
			} else if (matchedA) {
				matches.push({
					...base,
					equipeSlugs: [matchedA.equipeSlug],
					teamLabel: matchedA.nomAffiche,
					opponent: sideB,
					isDerby: false,
					isHome: true,
				});
			} else if (matchedB) {
				matches.push({
					...base,
					equipeSlugs: [matchedB.equipeSlug],
					teamLabel: matchedB.nomAffiche,
					opponent: sideA,
					isDerby: false,
					isHome: false,
				});
			}
			// Sinon : variante d'équipe présente dans le flux mais pas encore
			// déclarée dans les "Calendriers" de la fiche équipe correspondante
			// dans le CMS (ex: future 3e équipe) -- ignorée.
		}
	}

	matches.sort((a, b) => a.start.getTime() - b.start.getTime());
	return matches;
}

/** Tous les matchs de la prochaine journée de championnat, toutes équipes et
 * toutes compétitions du club confondues.
 *
 * Chaque compétition (un flux iCal = une poule) a sa propre numérotation de
 * journée, indépendante des autres catégories. On détermine donc la
 * "prochaine journée" compétition par compétition -- c'est le numéro de
 * journée du prochain match à venir de cette compétition -- puis on
 * regroupe tous les matchs de chaque compétition qui partagent ce même
 * numéro. Quand le flux ne fournit pas de numéro de journée exploitable, on
 * se rabat sur une fenêtre de quelques jours autour du prochain match de
 * cette compétition (une journée s'étale généralement sur un seul
 * week-end). Le résultat de chaque compétition est ensuite fusionné et trié
 * chronologiquement : les matchs affichés peuvent donc venir de week-ends
 * légèrement différents si les compétitions ne sont pas alignées, mais
 * chaque match affiché correspond bien à la prochaine échéance de son
 * équipe. */
export async function getNextMatchday(): Promise<AgendaMatch[]> {
	const matches = await getAgendaMatches();

	const byCompetition = new Map<string, AgendaMatch[]>();
	for (const match of matches) {
		const list = byCompetition.get(match.icsUrl) ?? [];
		list.push(match);
		byCompetition.set(match.icsUrl, list);
	}

	const result: AgendaMatch[] = [];
	for (const competitionMatches of byCompetition.values()) {
		const next = competitionMatches[0];
		if (!next) continue;

		if (next.journee != null) {
			result.push(...competitionMatches.filter((m) => m.journee === next.journee));
		} else {
			const windowMs = FALLBACK_MATCHDAY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
			const cutoff = next.start.getTime() + windowMs;
			result.push(...competitionMatches.filter((m) => m.start.getTime() <= cutoff));
		}
	}

	result.sort((a, b) => a.start.getTime() - b.start.getTime());
	return result;
}

/** Les prochains matchs d'une équipe précise (identifiée par son
 * `equipeSlug`), limités à `limit` résultats. Renvoie [] si cette équipe n'a
 * pas de flux configuré -- à l'appelant de ne rien afficher dans ce cas. */
export async function getMatchesForEquipe(equipeSlug: string, limit = 3): Promise<AgendaMatch[]> {
	const matches = await getAgendaMatches();
	return matches.filter((m) => m.equipeSlugs.includes(equipeSlug)).slice(0, limit);
}

/** true si au moins un calendrier est déclaré pour ce equipeSlug -- pour
 * savoir si l'on doit afficher un bloc "prochains matchs" sur cette section,
 * même quand la liste peut être vide. */
export async function hasAgendaFeed(equipeSlug: string): Promise<boolean> {
	const teams = await getAgendaTeams();
	return teams.some((t) => t.equipeSlug === equipeSlug);
}

/** Un lien de classement par compétition (flux), pas par équipe. */
export async function getCompetitionLinks(): Promise<Competition[]> {
	const competitions: Competition[] = [];

	for (const [url, teams] of await groupTeamsByFeed()) {
		const { events, calendarName } = await fetchFeed(url);
		const classementUrl =
			teams.find((t) => t.urlClassement)?.urlClassement ??
			derivePouleUrl(events.find((e) => e.matchUrl)?.matchUrl);

		if (!classementUrl) continue;

		competitions.push({
			label: calendarName || teams.map((t) => t.nomAffiche).join(" & "),
			icsUrl: url,
			classementUrl,
		});
	}

	return competitions;
}

export function formatMatchDate(date: Date): string {
	const label = new Intl.DateTimeFormat("fr-FR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		timeZone: "Europe/Paris",
	}).format(date);
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatMatchTime(date: Date): string {
	return new Intl.DateTimeFormat("fr-FR", {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Paris",
	}).format(date);
}
