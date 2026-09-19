import type { AgendaMatch, AgendaTeamConfig } from "./agenda";
import { jourParis, lireDateParis } from "./dateParis";
import { saisonPour } from "./saison";

/**
 * Superposition des annotations "match reporté" (collection "matchsReportes",
 * voir content.config.ts) sur les matchs issus des flux iCal de la
 * fédération. Fonction pure, sans accès à Astro ni au réseau : toute la
 * logique de correspondance et d'obsolescence est ici, testable seule.
 *
 * Trois situations pour une annotation, dans cet ordre :
 *  1. Le match figure encore dans le flux à sa date d'origine (la fédération
 *     n'a pas encore réagi) : l'annotation le REMPLACE par une carte "Reporté"
 *     -- le match du flux est retiré de la liste pour ne pas faire doublon.
 *  2. Absent à la date d'origine, mais le MÊME match (équipe, camp,
 *     adversaire) est réapparu dans le flux à une autre date : la fédération
 *     a replanifié. L'annotation est OBSOLÈTE : neutralisée (jamais
 *     supprimée -- si le flux régresse un jour, elle se réactive d'elle-même),
 *     le match s'affiche normalement à sa nouvelle date.
 *  3. Absent du flux partout (retiré en attendant la replanification) : carte
 *     autonome construite à partir de l'annotation seule -- sans elle, le
 *     match disparaîtrait de l'agenda comme s'il n'avait jamais existé.
 *
 * Principe de sûreté : un échec de correspondance ne doit jamais être
 * silencieux. En cas de doute on n'efface rien -- la carte "Reporté" ET le
 * match normal s'affichent (doublon visible), et un avertissement est écrit
 * dans le log du build.
 */

export interface MatchReporte {
	/** Identifiant de l'entrée dans la collection (nom de fichier). */
	id: string;
	equipeSlug: string;
	equipeLibelle?: string;
	adversaire: string;
	domicile: boolean;
	/** Jour d'origine du match (seul le jour compte, en heure de Paris). */
	dateOrigine: Date;
	nouvelleDate?: Date;
}

/** Minuscules, sans accents ni ponctuation, espaces réduits : "Handball Club
 * Carpentras" et "HANDBALL-CLUB  CARPENTRAS" sont "le même" adversaire. */
export function normaliser(texte: string | undefined | null): string {
	return (texte ?? "")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Égalité tolérante : "Carpentras" suffit pour "HANDBALL CLUB CARPENTRAS".
 * Le camp (domicile/extérieur), l'équipe et le jour ont déjà restreint les
 * candidats à quasi un seul match : la tolérance ne sert qu'à absorber les
 * abréviations, pas à départager des adversaires. Au moins 4 caractères pour
 * qu'un fragment trop court ne corresponde pas à tout. */
export function memeAdversaire(a: string | null, b: string): boolean {
	const x = normaliser(a);
	const y = normaliser(b);
	if (!x || !y) return false;
	if (x === y) return true;
	const [court, long] = x.length <= y.length ? [x, y] : [y, x];
	return court.length >= 4 && long.includes(court);
}

function memeEquipe(match: AgendaMatch, report: MatchReporte): boolean {
	// Un derby interne (deux équipes du club) n'a pas d'adversaire nommé : non
	// pris en charge, il s'affiche toujours normalement.
	return (
		!match.isDerby &&
		match.equipeSlugs[0] === report.equipeSlug &&
		normaliser(match.equipeLibelle) === normaliser(report.equipeLibelle)
	);
}

/** Une annotation n'a plus lieu d'être quand le match reporté a eu lieu (sa
 * nouvelle date est passée) ou, sans nouvelle date, quand sa saison est
 * terminée -- sinon une annotation jamais replanifiée resterait épinglée en
 * tête de l'agenda indéfiniment. */
function estPerimee(report: MatchReporte, now: Date): boolean {
	if (report.nouvelleDate) return report.nouvelleDate < now;
	return saisonPour(report.dateOrigine) !== saisonPour(now);
}

export function appliquerReports(
	matchsFlux: AgendaMatch[],
	reports: MatchReporte[],
	equipes: AgendaTeamConfig[],
	now: Date,
	avertir: (message: string) => void,
): AgendaMatch[] {
	const retires = new Set<AgendaMatch>();
	const cartes: AgendaMatch[] = [];

	for (const report of reports) {
		if (estPerimee(report, now)) continue;

		const decrit = `${report.equipeSlug}${report.equipeLibelle ? ` ${report.equipeLibelle}` : ""} vs ${report.adversaire} (prévu le ${jourParis(report.dateOrigine)})`;

		const equipe = equipes.find(
			(t) => t.equipeSlug === report.equipeSlug && normaliser(t.libelle) === normaliser(report.equipeLibelle),
		);
		if (!equipe) {
			avertir(
				`Match reporté ignoré, équipe inconnue (identifiant ou libellé sans calendrier, ou équipe archivée) : ${decrit} [${report.id}]`,
			);
			continue;
		}

		const memeCamp = matchsFlux.filter((m) => memeEquipe(m, report) && m.isHome === report.domicile);
		const candidats = memeCamp.filter((m) => memeAdversaire(m.opponent, report.adversaire));
		const jourOrigine = jourParis(report.dateOrigine);
		const dansLeFlux = candidats.find((m) => jourParis(m.start) === jourOrigine);

		// Le début de la carte : la nouvelle date si elle est connue, sinon la
		// date d'origine -- elle garde ainsi sa place dans la liste (et reste
		// en tête une fois cette date passée, tant que rien n'est replanifié).
		const reporte = { dateOrigine: report.dateOrigine, nouvelleDate: report.nouvelleDate };

		if (dansLeFlux) {
			retires.add(dansLeFlux);
			cartes.push({
				...dansLeFlux,
				id: `report-${report.id}`,
				start: report.nouvelleDate ?? dansLeFlux.start,
				// Ni salle ni lien de rencontre : ils concernent la date d'origine
				// et peuvent changer avec la replanification.
				location: "",
				matchUrl: undefined,
				reporte,
			});
			continue;
		}

		if (candidats.length > 0) {
			avertir(
				`Match reporté OBSOLÈTE, le match est réapparu dans le flux au ${jourParis(candidats[0].start)} : ${decrit} [${report.id}]. Ignoré : vous pouvez supprimer cette entrée dans « Matchs reportés ».`,
			);
			continue;
		}

		const memeJour = memeCamp.filter((m) => jourParis(m.start) === jourOrigine);
		if (memeJour.length > 0) {
			avertir(
				`Match reporté sans correspondance exacte : même équipe, même jour, même camp, mais l'adversaire du flux est « ${memeJour[0].opponent} » et non « ${report.adversaire} » [${report.id}]. Vérifiez l'orthographe : en attendant, la carte « Reporté » ET le match du flux s'affichent tous les deux.`,
			);
		}

		cartes.push({
			id: `report-${report.id}`,
			equipeSlugs: [equipe.equipeSlug],
			teamLabel: equipe.nomAffiche,
			equipeLibelle: equipe.libelle,
			opponent: report.adversaire,
			isDerby: false,
			isHome: report.domicile,
			start: report.nouvelleDate ?? (lireDateParis(jourOrigine) as Date),
			location: "",
			icsUrl: equipe.urlIcs,
			journee: null,
			reporte,
		});
	}

	return [...matchsFlux.filter((m) => !retires.has(m)), ...cartes].sort(
		(a, b) => a.start.getTime() - b.start.getTime(),
	);
}
