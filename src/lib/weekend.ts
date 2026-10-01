import { getCollection } from "astro:content";
import { getAgendaMatches, getMatchsDepuis, maintenant, type AgendaMatch } from "./agenda";
import { jourParis, lireDateParis } from "./dateParis";
import { memeAdversaire, normaliser } from "./matchsReportes";
import { issueDuMatch, scoreNousEux, type Issue, type Resultat } from "./resultats";

/**
 * Bloc "Ce week-end" de la page d'accueil. Tout est calculé AU BUILD (site
 * statique) : le moment de la semaine dépend de l'heure du build, d'où les
 * reconstructions programmées samedi et dimanche soir (voir
 * .github/workflows/deploy.yml). Aucune logique de date côté navigateur.
 */

/** "a-venir" du mardi 00h au dimanche 17h59 ; "resultats" du dimanche 18h
 * au lundi 23h59 (heure de Paris). */
export type ModeWeekend = "a-venir" | "resultats";

export interface FenetreWeekend {
	/** Samedi 00h00, heure de Paris. */
	debut: Date;
	/** Lundi 00h00 suivant, heure de Paris (exclu). */
	fin: Date;
	mode: ModeWeekend;
}

const HEURE_PARIS = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", hour: "numeric", hourCycle: "h23" });

/** "2026-10-03" décalé de `jours` jours, sans passer par un instant (pas de
 * piège de changement d'heure). */
function decalerJour(jour: string, jours: number): string {
	const [a, m, j] = jour.split("-").map(Number);
	return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

/** Le week-end affiché à l'instant `now` : celui qui vient (du mardi au
 * samedi), celui en cours (samedi et dimanche) ou celui qui vient de finir
 * (le lundi). Calculé sur le calendrier de Paris, pas sur l'UTC du runner
 * GitHub Actions. Fonction pure, testable seule. */
export function fenetreWeekend(now: Date): FenetreWeekend {
	const aujourdhui = jourParis(now);
	const [a, m, j] = aujourdhui.split("-").map(Number);
	const jourSemaine = new Date(Date.UTC(a, m - 1, j)).getUTCDay(); // 0 = dimanche
	const heure = Number(HEURE_PARIS.format(now));

	let ecartSamedi: number;
	let mode: ModeWeekend = "a-venir";
	if (jourSemaine === 1) {
		ecartSamedi = -2;
		mode = "resultats";
	} else if (jourSemaine === 0) {
		ecartSamedi = -1;
		if (heure >= 18) mode = "resultats";
	} else {
		ecartSamedi = 6 - jourSemaine;
	}

	const samedi = decalerJour(aujourdhui, ecartSamedi);
	return {
		debut: lireDateParis(`${samedi}T00:00`) as Date,
		fin: lireDateParis(`${decalerJour(samedi, 2)}T00:00`) as Date,
		mode,
	};
}

/** Ce qu'affiche la colonne de droite d'une ligne : le score si le match est
 * joué (et sa feuille importée), sinon l'heure, ou "score à venir" pour un
 * match passé dont la feuille n'est pas encore arrivée. */
export type EtatLigne =
	| { type: "heure" }
	| { type: "score"; gauche: number; droite: number; issue: Issue | null }
	| { type: "forfait"; issue: Issue }
	| { type: "score-a-venir" };

export interface LigneWeekend {
	match: AgendaMatch;
	etat: EtatLigne;
	/** Lien vers /agenda filtré sur l'équipe (mêmes slugs que FiltreEquipes). */
	equipeSlug: string;
}

export type BlocWeekend =
	| { type: "weekend"; fenetre: FenetreWeekend; lignes: LigneWeekend[] }
	| { type: "prochain"; fenetre: FenetreWeekend; prochain: AgendaMatch }
	| { type: "vide" };

/** Résultat importé correspondant à un match du flux : même équipe, même
 * jour (Paris), puis même libellé d'équipe et même adversaire seulement s'il
 * faut départager. Dans le doute (plusieurs candidats restants), aucun score
 * plutôt qu'un score faux. */
export function trouverResultat(match: AgendaMatch, resultats: Resultat[]): Resultat | undefined {
	const jour = jourParis(match.start);
	let candidats = resultats.filter(
		(r) => match.equipeSlugs.includes(r.data.equipeSlug) && jourParis(r.data.date) === jour,
	);
	if (candidats.length <= 1 || match.isDerby) return candidats[0];

	if (match.equipeLibelle) {
		const memeLibelle = candidats.filter((r) => normaliser(r.data.equipeNumero) === normaliser(match.equipeLibelle));
		if (memeLibelle.length > 0) candidats = memeLibelle;
	}
	if (candidats.length > 1) {
		candidats = candidats.filter((r) => memeAdversaire(match.opponent, r.data.adversaire));
	}
	return candidats.length === 1 ? candidats[0] : undefined;
}

function etatLigne(match: AgendaMatch, resultat: Resultat | undefined, now: Date): EtatLigne {
	// Un match pas encore commencé n'a pas de résultat : ne se produit qu'en
	// rejouant un autre moment avec HBI_MAINTENANT, mais garde la règle "score
	// si joué, sinon heure" vraie dans tous les cas.
	if (resultat && match.start <= now) {
		if (resultat.data.forfait) return { type: "forfait", issue: issueDuMatch(resultat) };
		const { scoreDomicile, scoreExterieur } = resultat.data;
		if (scoreDomicile != null && scoreExterieur != null) {
			// Derby interne : pas de "nous/eux", le score se lit domicile -
			// extérieur, dans l'ordre du libellé "A – B".
			if (match.isDerby) return { type: "score", gauche: scoreDomicile, droite: scoreExterieur, issue: null };
			const score = scoreNousEux(resultat)!;
			return { type: "score", gauche: score.nous, droite: score.eux, issue: issueDuMatch(resultat) };
		}
	}
	return match.start < now ? { type: "score-a-venir" } : { type: "heure" };
}

/** Domicile d'abord (c'est là que le public peut venir), puis chronologique. */
function comparerLignes(a: LigneWeekend, b: LigneWeekend): number {
	if (a.match.isHome !== b.match.isHome) return a.match.isHome ? -1 : 1;
	return a.match.start.getTime() - b.match.start.getTime();
}

/** Un match reporté sans nouvelle date ne se joue pas ce week-end-là : jamais
 * affiché dans ce bloc (il reste visible sur /agenda). */
function seJoue(match: AgendaMatch): boolean {
	return !match.reporte || match.reporte.nouvelleDate != null;
}

export async function getBlocWeekend(): Promise<BlocWeekend> {
	const now = maintenant();
	const fenetre = fenetreWeekend(now);

	// Depuis le samedi 00h et non depuis maintenant : les matchs déjà joués du
	// week-end sont encore dans le flux fédéral, c'est notre filtre qui les
	// écartait. Aucun état n'est conservé d'un build à l'autre.
	const [matchs, resultats] = await Promise.all([getMatchsDepuis(fenetre.debut), getCollection("resultats")]);

	const lignes = matchs
		.filter((m) => seJoue(m) && m.start >= fenetre.debut && m.start < fenetre.fin)
		.map((match) => ({
			match,
			etat: etatLigne(match, trouverResultat(match, resultats), now),
			equipeSlug: match.equipeSlugs[0],
		}))
		.sort(comparerLignes);

	if (lignes.length > 0) return { type: "weekend", fenetre, lignes };

	const prochain = (await getAgendaMatches()).find(seJoue);
	return prochain ? { type: "prochain", fenetre, prochain } : { type: "vide" };
}

/** "3 – 4 octobre", ou "31 octobre – 1er novembre" à cheval sur deux mois. */
export function formatFenetre(fenetre: FenetreWeekend): string {
	const dimanche = new Date(fenetre.fin.getTime() - 12 * 3600 * 1000);
	const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts }).format(d);
	const memeMois = fmt(fenetre.debut, { month: "long" }) === fmt(dimanche, { month: "long" });
	const debut = memeMois ? fmt(fenetre.debut, { day: "numeric" }) : fmt(fenetre.debut, { day: "numeric", month: "long" });
	const fin = fmt(dimanche, { day: "numeric", month: "long" }).replace(/^1 /, "1er ");
	return `${debut} – ${fin}`;
}

/** "sam. 14:00" */
export function formatJourHeure(date: Date): string {
	const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short" }).format(date);
	const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(date);
	return `${jour} ${heure}`;
}
