import ical from "node-ical";
import type { VEvent } from "node-ical";
import { getCollection } from "astro:content";
import { appliquerReports, type MatchReporte } from "./matchsReportes";

export interface AgendaTeamConfig {
	/** Nom affiché sur le site (page /equipes, page /agenda) : le nom de
	 * l'équipe, complété par son "libelle" (ex. "1"/"2") si plusieurs
	 * équipes du club partagent la même poule. */
	nomAffiche: string;
	/** Version abrégée de `nomAffiche` ("SM1", "U15M Exc.") pour les listes
	 * denses sur mobile (bloc "Ce week-end" de l'accueil) -- voir nomCourt(). */
	nomCourt: string;
	/** Le "libelle" du calendrier tel que saisi dans le CMS (ex. "1"/"2"),
	 * absent pour une équipe seule dans sa catégorie. Sert à retrouver l'équipe
	 * visée par une annotation "match reporté". */
	libelle?: string;
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
	/** Version abrégée de `teamLabel` (voir AgendaTeamConfig.nomCourt). */
	teamLabelCourt: string;
	/** Nom de l'adversaire, ou null pour un derby interne au club. */
	opponent: string | null;
	isDerby: boolean;
	isHome: boolean;
	/** Libellé du calendrier de l'équipe HBI concernée (voir
	 * AgendaTeamConfig.libelle). Absent pour un derby interne. */
	equipeLibelle?: string;
	/** Date de début. Pour un match reporté : la nouvelle date si elle est
	 * connue, sinon la date d'origine (sert uniquement à le classer dans la
	 * liste -- ne pas l'afficher comme une date de match, voir `reporte`). */
	start: Date;
	location: string;
	/** Coordonnées GPS du gymnase, quand le flux les fournit (voir
	 * FeedEvent.geo) -- sert à construire un lien "geo:" plus précis
	 * qu'une recherche par adresse, voir androidGeoUri(). */
	geo?: { lat: number; lon: number };
	matchUrl?: string;
	/** Flux iCal d'origine (pour le bouton "Ajouter à mon agenda"). */
	icsUrl: string;
	classementUrl?: string;
	/** Numéro de journée de championnat, extrait de la description de
	 * l'événement iCal quand le flux le fournit (ex: "Journée 3"). Sert à
	 * regrouper de façon fiable les matchs d'une même journée. */
	journee: number | null;
	/** Présent uniquement si ce match est signalé comme reporté dans le CMS
	 * (collection "matchsReportes", voir src/lib/matchsReportes.ts). Sans
	 * `nouvelleDate`, la fédération n'a pas encore replanifié le match. */
	reporte?: { dateOrigine: Date; nouvelleDate?: Date };
}

export interface Competition {
	label: string;
	icsUrl: string;
	classementUrl?: string;
}

const HOME_LOCATION_PATTERN = /emile avy/i;
const JOURNEE_PATTERN = /journ[ée]e\s*(\d+)/i;

/** Nom d'équipe non renseigné côté fédération sur le flux ("SANS LIBELLE"
 * plutôt qu'un vrai nom de club) -- motif générique, pas propre à une équipe
 * précise : constaté sur le flux U15 féminines 2026-2027 (c-33207), mais
 * rien n'empêche qu'une autre équipe soit un jour touchée par le même défaut
 * de saisie fédéral. Voir estNomEquipeNonRenseigne() ci-dessous. */
const NOM_EQUIPE_NON_RENSEIGNE_PATTERN = /^sans\s*libell[ée]?$/i;

function estNomEquipeNonRenseigne(nom: string): boolean {
	const texte = nom.trim();
	return texte === "" || NOM_EQUIPE_NON_RENSEIGNE_PATTERN.test(texte);
}

/** L'instant de référence du build. `HBI_MAINTENANT` (date ISO avec fuseau,
 * ex. "2026-09-27T19:00:00+02:00") ne sert qu'à vérifier en local
 * l'affichage d'un autre moment de la semaine (bloc "Ce week-end" de
 * l'accueil) -- jamais défini sur le workflow de déploiement. */
export function maintenant(): Date {
	const simule = process.env.HBI_MAINTENANT;
	if (simule) {
		const date = new Date(simule);
		if (!Number.isNaN(date.getTime())) return date;
	}
	return new Date();
}

const LETTRE_GENRE: Record<string, string> = { feminin: "F", masculin: "M" };

/** "Seniors masculins" + "1" -> "SM1", "U15 masculins" + "U15 Excellence"
 * -> "U15M Exc.", "U11 mixtes" -> "U11" : assez court pour tenir sur une
 * seule ligne de liste sur mobile. Sans catégorie d'âge (ne devrait pas
 * arriver pour une équipe qui a un calendrier), repli sur le nom complet. */
function nomCourt(nom: string, categorieAge: string | undefined, genre: string | undefined, libelle: string | undefined): string {
	const lettre = genre ? (LETTRE_GENRE[genre] ?? "") : "";
	const code = categorieAge === "senior" ? `S${lettre}` : categorieAge ? `${categorieAge.toUpperCase()}${lettre}` : nom;
	// Le libellé répète souvent la catégorie ("U15 Excellence") : seul le reste
	// distingue les deux équipes.
	const reste = (libelle ?? "").replace(new RegExp(`^${categorieAge ?? "$^"}\\s*`, "i"), "").trim();
	if (!reste) return code;
	if (/^\d+$/.test(reste)) return `${code}${reste}`;
	const mot = reste.split(/\s+/)[0];
	return mot.length <= 4 ? `${code} ${mot}` : `${code} ${mot.slice(0, 3)}.`;
}

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
	/** Coordonnées GPS du gymnase, quand le flux les fournit (champ iCal
	 * GEO -- voir androidGeoUri() plus bas) : la fédération les renseigne
	 * systématiquement en pratique, mais rien ne l'y oblige. */
	geo?: { lat: number; lon: number };
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
						geo:
							event.geo && typeof event.geo.lat === "number" && typeof event.geo.lon === "number"
								? { lat: event.geo.lat, lon: event.geo.lon }
								: undefined,
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
						nomCourt: nomCourt(equipe.data.nom, equipe.data.categorieAge, equipe.data.genre, cal.libelle),
						libelle: cal.libelle,
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

/** Les matchs du flux fédéral commençant à partir de `depuis`, SANS les
 * annotations "match reporté" du CMS -- voir getAgendaMatches(). Le flux
 * garde les matchs déjà joués de la saison : c'est `depuis` seul qui les
 * écarte (l'instant présent pour /agenda, le samedi 00h pour le bloc "Ce
 * week-end" de l'accueil, qui doit encore lister les matchs déjà joués). */
async function getMatchsDuFlux(depuis: Date): Promise<AgendaMatch[]> {
	const matches: AgendaMatch[] = [];

	for (const [url, teams] of await groupTeamsByFeed()) {
		const { events } = await fetchFeed(url);
		if (events.length === 0) continue;

		const classementUrl =
			teams.find((t) => t.urlClassement)?.urlClassement ??
			derivePouleUrl(events.find((e) => e.matchUrl)?.matchUrl);

		for (const event of events) {
			if (event.start < depuis) continue;

			// Pas de filtre générique "handball islois" ici : une équipe engagée
			// dans une entente avec un autre club (ex. U17F 2026-2027, "L'ISLE -
			// LE THOR") n'a aucune occurrence de "Handball"/"Islois" dans son nom
			// sur le flux -- seul le `matchLabel` (repere du CMS) de chaque
			// équipe déclarée pour CE flux permet de savoir si l'événement la
			// concerne, via matchedA/matchedB juste en dessous. Un événement qui
			// ne correspond à aucune équipe connue reste ignoré comme avant (voir
			// le commentaire en fin de boucle).
			const sides = splitTeams(event.summary);
			if (!sides) continue;
			const [sideA, sideB] = sides;

			const matchedA = teams.find((t) => sideA.toLowerCase().includes(t.matchLabel.toLowerCase()));
			const matchedB = teams.find((t) => sideB.toLowerCase().includes(t.matchLabel.toLowerCase()));

			const base = {
				id: event.uid,
				start: event.start,
				location: event.location,
				geo: event.geo,
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
					teamLabelCourt: `${matchedA.nomCourt} – ${matchedB.nomCourt}`,
					opponent: null,
					isDerby: true,
					isHome: HOME_LOCATION_PATTERN.test(event.location),
				});
			} else if (matchedA) {
				matches.push({
					...base,
					equipeSlugs: [matchedA.equipeSlug],
					teamLabel: matchedA.nomAffiche,
					teamLabelCourt: matchedA.nomCourt,
					equipeLibelle: matchedA.libelle,
					opponent: sideB,
					isDerby: false,
					isHome: true,
				});
			} else if (matchedB) {
				matches.push({
					...base,
					equipeSlugs: [matchedB.equipeSlug],
					teamLabel: matchedB.nomAffiche,
					teamLabelCourt: matchedB.nomCourt,
					equipeLibelle: matchedB.libelle,
					opponent: sideA,
					isDerby: false,
					isHome: false,
				});
			} else if (teams.length === 1) {
				// Aucun nom ne correspond, mais UNE SEULE équipe du club est
				// déclarée sur ce flux (pas de partage de poule, contrairement aux
				// Seniors masculins 1/2 -- voir la branche matchedA/matchedB
				// ci-dessus, inchangée pour ce cas) : les flux de compétition
				// FFHandball (c-<poule>/s-3577.ics, où "s-3577" identifie la
				// STRUCTURE du club, pas seulement la saison) sont déjà filtrés
				// côté serveur pour ne renvoyer QUE les matchs du club -- vérifié
				// sur les 10 flux utilisés par le club (36 événements, aucun match
				// entre deux équipes tierces, le 28/09/2026). Pas besoin de
				// retrouver le nom du club dans le texte pour savoir que cet
				// événement le concerne : seulement pour déterminer qui, des deux
				// noms, est le HBI -- utile quand ce nom n'est pas seulement mal
				// orthographié mais carrément vide côté fédération (ex. "SANS
				// LIBELLE vs SALON HANDBALL CLUB PROVENCE", flux U15F 2026-2027).
				// Le camp HBI est repéré comme celui dont le nom est vide/non
				// renseigné ; la POSITION dans le titre (le recevant est toujours
				// listé en premier, même constat que sur les feuilles de match PDF
				// anciennes -- voir src/lib/fdme/) donne alors domicile/extérieur,
				// sans avoir besoin d'y faire correspondre le nom du club.
				const team = teams[0];
				const aVide = estNomEquipeNonRenseigne(sideA);
				const bVide = estNomEquipeNonRenseigne(sideB);
				if (aVide && !bVide) {
					matches.push({
						...base,
						equipeSlugs: [team.equipeSlug],
						teamLabel: team.nomAffiche,
						teamLabelCourt: team.nomCourt,
						equipeLibelle: team.libelle,
						opponent: sideB,
						isDerby: false,
						isHome: true,
					});
				} else if (bVide && !aVide) {
					matches.push({
						...base,
						equipeSlugs: [team.equipeSlug],
						teamLabel: team.nomAffiche,
						teamLabelCourt: team.nomCourt,
						equipeLibelle: team.libelle,
						opponent: sideA,
						isDerby: false,
						isHome: false,
					});
				}
				// Sinon (aucun nom vide des deux côtés, ou les deux) : aucun signal
				// fiable pour savoir qui est le club -- ignoré plutôt que deviné,
				// comme le cas juste en dessous.
			}
			// Sinon : variante d'équipe présente dans le flux mais pas encore
			// déclarée dans les "Calendriers" de la fiche équipe correspondante
			// dans le CMS (ex: future 3e équipe) -- ignorée.
		}
	}

	matches.sort((a, b) => a.start.getTime() - b.start.getTime());
	return matches;
}

/** Chaque avertissement n'est écrit qu'une fois par build, même si
 * getAgendaMatches() est appelée par plusieurs pages. */
const avertissementsDejaEcrits = new Set<string>();
function avertirUneFois(message: string) {
	if (avertissementsDejaEcrits.has(message)) return;
	avertissementsDejaEcrits.add(message);
	console.warn(`[agenda] ${message}`);
}

async function getMatchsReportes(): Promise<MatchReporte[]> {
	const entrees = await getCollection("matchsReportes");
	return entrees.map((e) => ({
		id: e.id,
		equipeSlug: e.data.equipeSlug,
		equipeLibelle: e.data.equipeLibelle,
		adversaire: e.data.adversaire,
		domicile: e.data.domicile,
		dateOrigine: e.data.dateOrigine,
		nouvelleDate: e.data.nouvelleDate,
	}));
}

/** Tous les matchs à venir du club : ceux du flux fédéral, avec les matchs
 * signalés comme reportés dans le CMS superposés (voir
 * src/lib/matchsReportes.ts pour la logique de correspondance). Un match
 * reporté sans nouvelle date reste dans la liste même une fois sa date
 * d'origine passée -- il ne disparaît que quand il est replanifié ou que sa
 * saison se termine. */
export async function getAgendaMatches(): Promise<AgendaMatch[]> {
	const now = maintenant();
	return getMatchsDepuis(now, now);
}

/** Comme getAgendaMatches(), mais à partir de `depuis` plutôt que de
 * l'instant présent -- y compris des matchs déjà joués, encore présents dans
 * le flux. `depuis` sert aussi d'instant de référence pour les annotations
 * "match reporté" : une annotation dont la nouvelle date tombe après
 * `depuis` (donc éventuellement déjà jouée) reste appliquée. */
export async function getMatchsDepuis(depuis: Date, now: Date = depuis): Promise<AgendaMatch[]> {
	const [matchsFlux, reports, equipes] = await Promise.all([
		getMatchsDuFlux(depuis),
		getMatchsReportes(),
		getAgendaTeams(),
	]);
	return appliquerReports(matchsFlux, reports, equipes, now, avertirUneFois);
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

/** "Samedi 26 septembre à 20:30" -- ou, pour un match reporté, "Reporté au
 * samedi 3 octobre à 18:00" / "Reporté, nouvelle date à venir". */
export function formatMatchQuand(match: AgendaMatch): string {
	if (!match.reporte) return `${formatMatchDate(match.start)} à ${formatMatchTime(match.start)}`;
	const { nouvelleDate } = match.reporte;
	if (!nouvelleDate) return "Reporté, nouvelle date à venir";
	return `Reporté au ${formatMatchDate(nouvelleDate).toLowerCase()} à ${formatMatchTime(nouvelleDate)}`;
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

/** Lien de recherche cartographique pour le lieu d'un match, construit depuis
 * l'adresse que le flux iCal fournit déjà dans LOCATION (ex. "EMILE AVY,
 * AVENUE JEAN BOUIN 84800, L ISLE SUR LA SORGUE") -- aucune saisie
 * supplémentaire côté CMS.
 *
 * Lien qui fonctionne PARTOUT (Android, iPhone, ordinateur, sans JavaScript)
 * : c'est le lien par défaut affiché dans le HTML, gardé tel quel comme
 * secours si androidGeoUri() ci-dessous ne s'applique pas -- voir le script
 * dans agenda.astro qui choisit lequel des deux afficher. Un simple lien
 * sortant au clic -- aucun script ni cookie tiers chargé sur nos pages.
 *
 * Renvoie undefined quand le flux ne donne aucun lieu : à l'appelant de ne
 * rien afficher plutôt que d'ouvrir une recherche vide. */
export function mapsSearchUrl(location: string): string | undefined {
	const adresse = location.trim();
	if (!adresse) return undefined;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
}

/** Lien au format "geo:", reconnu UNIQUEMENT par Android : c'est le seul des
 * deux formats qui déclenche, sur cet OS, le sélecteur natif entre toutes
 * les applications de navigation installées et enregistrées pour ce type de
 * lien (Maps, Waze, Géoportail...) -- une URL Google Maps classique (voir
 * mapsSearchUrl() ci-dessus) ouvre toujours Google Maps spécifiquement, y
 * compris sur Android. Sur iPhone, Safari ne reconnaît pas "geo:" du tout :
 * il n'existe pas d'équivalent à ce sélecteur natif pour ce format --
 * mapsSearchUrl() y reste donc le seul lien pertinent. Le choix entre les
 * deux se fait côté navigateur (voir le script dans agenda.astro), jamais
 * ici : on ne sait rien de l'appareil qui affichera la page au moment du
 * build.
 *
 * Utilise les coordonnées GPS du flux iCal (champ GEO) quand elles sont
 * disponibles -- une recherche par coordonnées est plus fiable pour un
 * sélecteur d'applications qu'une recherche par adresse texte. Repli sur
 * l'adresse texte sinon (mêmes données que mapsSearchUrl()).
 *
 * Renvoie undefined dans les mêmes cas que mapsSearchUrl() (aucun lieu) :
 * l'appelant garde alors le lien Google Maps par défaut -- jamais de lien
 * mort, même en cas de doute sur l'appareil (voir le script). */
export function androidGeoUri(location: string, geo?: { lat: number; lon: number }): string | undefined {
	const adresse = location.trim();
	if (geo) {
		const label = encodeURIComponent(adresse || `${geo.lat},${geo.lon}`);
		return `geo:${geo.lat},${geo.lon}?q=${geo.lat},${geo.lon}(${label})`;
	}
	if (!adresse) return undefined;
	return `geo:0,0?q=${encodeURIComponent(adresse)}`;
}
