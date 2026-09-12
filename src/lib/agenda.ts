import ical from "node-ical";
import type { VEvent } from "node-ical";
import { agendaTeams, type AgendaTeamConfig } from "../data/agenda-teams.config";

export interface AgendaMatch {
	id: string;
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
}

export interface Competition {
	label: string;
	icsUrl: string;
	classementUrl?: string;
}

const CLUB_PATTERN = /handball\s*islois/i;
const HOME_LOCATION_PATTERN = /emile avy/i;

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

function groupTeamsByFeed(): Map<string, AgendaTeamConfig[]> {
	const byUrl = new Map<string, AgendaTeamConfig[]>();
	for (const team of agendaTeams) {
		const list = byUrl.get(team.urlIcs) ?? [];
		list.push(team);
		byUrl.set(team.urlIcs, list);
	}
	return byUrl;
}

export async function getAgendaMatches(): Promise<AgendaMatch[]> {
	const now = new Date();
	const matches: AgendaMatch[] = [];

	for (const [url, teams] of groupTeamsByFeed()) {
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
			};

			if (matchedA && matchedB) {
				matches.push({
					...base,
					teamLabel: `${matchedA.nomAffiche} vs ${matchedB.nomAffiche}`,
					opponent: null,
					isDerby: true,
					isHome: HOME_LOCATION_PATTERN.test(event.location),
				});
			} else if (matchedA) {
				matches.push({ ...base, teamLabel: matchedA.nomAffiche, opponent: sideB, isDerby: false, isHome: true });
			} else if (matchedB) {
				matches.push({ ...base, teamLabel: matchedB.nomAffiche, opponent: sideA, isDerby: false, isHome: false });
			}
			// Sinon : variante d'équipe présente dans le flux mais pas encore
			// déclarée dans agenda-teams.config.ts (ex: future 3e équipe) -- ignorée.
		}
	}

	matches.sort((a, b) => a.start.getTime() - b.start.getTime());
	return matches;
}

export async function getNextHomeMatch(): Promise<AgendaMatch | undefined> {
	const matches = await getAgendaMatches();
	return matches.find((m) => m.isHome);
}

/** Un lien de classement par compétition (flux), pas par équipe. */
export async function getCompetitionLinks(): Promise<Competition[]> {
	const competitions: Competition[] = [];

	for (const [url, teams] of groupTeamsByFeed()) {
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
