import { getCollection } from "astro:content";
import { formatNomPropre } from "./fdme/noms.mjs";
import { trierEquipes } from "./equipes";
import { categorieActuelleParHash } from "./carriereJoueur";
import { scoreNousEux, statsEquipeNous, type Resultat } from "./resultats";
import { saisonActuelle, saisonPour } from "./saison";
import introuvables from "../data/feuilles-introuvables.json";
import suiviAuto from "../data/feuilles-auto.json";

/**
 * Records de la page /records (demande du 29/09/2026). Deux règles de
 * confidentialité structurent tout le module :
 *
 * - Les performances INDIVIDUELLES ne citent que les « joueurs actuels »
 *   affichés en nom complet : catégorie actuelle (voir
 *   categorieActuelleParHash) dont le réglage `affichageStats` vaut
 *   "nominatif" -- la même source que /statistiques-carriere, jamais un seuil
 *   d'âge écrit en dur. Un enfant d'une catégorie pseudonymisée n'est jamais
 *   mis en vitrine, même sous son pseudonyme.
 * - Les catégories plus jeunes n'ont que des records d'ÉQUIPE, calculés sur
 *   le score officiel et les totaux d'équipe -- jamais sur la somme des
 *   lignes joueur, amputée par la règle des 3 saisons (voir
 *   src/lib/fdme/retention.mjs).
 *
 * Pour la même raison, la période longue n'est jamais écrite en dur : elle
 * part de la saison la plus ancienne RÉELLEMENT présente dans les données
 * utilisées (après rétention), recalculée à chaque build -- un titre figé
 * deviendrait faux dès que la rétention retire une saison de plus.
 */

/** Nombre de places affichées par classement (égalités incluses au-delà). */
const PODIUM = 3;
/** Plafond de noms par classement : en début de saison, dix personnes à
 * égalité avec 3 matchs rendraient la liste illisible ; les suivantes sont
 * seulement comptées. */
const MAX_LIGNES = 5;
/** Seuils de matchs "dans le but" (au moins un arrêt) pour figurer au
 * classement des arrêts par match : un gardien avec un seul match ne doit
 * pas y trôner. */
const SEUIL_ARRETS_PAR_MATCH = { periode: 5, saison: 3 };
/** Matchs avec totaux d'équipe exigés pour un pourcentage d'arrêts d'équipe
 * sur une saison. */
const SEUIL_POURCENTAGE_EQUIPE = 3;

export interface LignePerformance {
	valeur: string;
	joueur: string;
	equipe: string;
	contexte: string;
}

export interface Classement {
	titre: string;
	/** Précision affichée sous le titre (seuil, définition). */
	note?: string;
	lignes: LignePerformance[];
	/** Personnes à égalité au-delà du plafond de noms, non affichées. */
	autresAEgalite: number;
	/** Nom affiché de chaque personne à la première place (égalités
	 * comprises). */
	detenteurs: string[];
}

export interface RecordEquipe {
	titre: string;
	valeur: string;
	contexte: string;
}

export interface RecordsEquipe {
	equipe: string;
	records: RecordEquipe[];
}

export interface RecordsPeriode {
	/** "2020-2021" pour la période longue, la saison en cours sinon. */
	saisonDebut: string | null;
	performances: Classement[];
	equipes: RecordsEquipe[];
}

export interface Records {
	saisonEnCours: string;
	cetteSaison: RecordsPeriode;
	depuis: RecordsPeriode;
}

type Ligne = { r: Resultat; buts: number; arrets: number };
type Candidat = { valeur: number; texte: string; hash: string; contexte: string };

const pourcent = (x: number) => `${Math.round(x * 100)} %`;
// Avec l'année, contrairement à formatDateCourte() (resultats.ts) : un
// record peut dater de plusieurs saisons.
const DATE_LONGUE = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });
const dateLongue = (date: Date) => DATE_LONGUE.format(date);
const unDecimal = (x: number) => x.toFixed(1).replace(".", ",");

function contexteMatch(r: Resultat, nomEquipe: Map<string, string>): string {
	const equipe = nomEquipe.get(r.data.equipeSlug) ?? r.data.equipeSlug;
	return `contre ${r.data.adversaire}, ${dateLongue(r.data.date)} (${equipe})`;
}

/** Les meilleurs, égalités comprises à la dernière place du podium. Une
 * seule ligne par personne (sa meilleure performance) : un podium occupé
 * trois fois par la même gardienne n'apprend rien, et chacun·e n'est pas
 * exposé·e plus que nécessaire. */
function podium(candidats: Candidat[]): Candidat[] {
	const vus = new Set<string>();
	const tries = candidats
		.filter((c) => c.valeur > 0)
		.sort((a, b) => b.valeur - a.valeur)
		.filter((c) => !vus.has(c.hash) && vus.add(c.hash));
	if (tries.length <= PODIUM) return tries;
	const seuil = tries[PODIUM - 1].valeur;
	return tries.filter((c) => c.valeur >= seuil);
}

/** Rencontres jouées dont on n'a pas la feuille : une série qui les englobe
 * pourrait être cassée ou prolongée à tort, elle n'est donc jamais affichée
 * (demande du 29/09/2026 : pas de chiffre montré avec un doute). */
export interface Trous {
	/** Match précis manquant, pour une équipe. */
	rencontres: { equipeSlug: string; saison: string; t: number }[];
	/** Équipe + saison dont la complétude n'a pas pu être vérifiée. */
	saisonsInverifiables: Set<string>;
}

function chargerTrous(): Trous {
	const rencontres = introuvables.rencontres.map((m) => ({ equipeSlug: m.equipeSlug, saison: saisonPour(new Date(m.date)), t: new Date(m.date).getTime() }));
	// Saison en cours : feuilles que la récupération automatique n'a pas pu
	// obtenir alors que le score est publié (voir scripts/recuperer-feuilles.mjs).
	for (const r of Object.values(suiviAuto.rencontres as Record<string, { statut?: string; date?: string; equipeSlug?: string }>)) {
		if (!r.date || !r.equipeSlug || !["attente_feuille", "abandon", "echec_lecture"].includes(r.statut ?? "")) continue;
		rencontres.push({ equipeSlug: r.equipeSlug, saison: saisonPour(new Date(r.date)), t: new Date(r.date).getTime() });
	}
	return { rencontres, saisonsInverifiables: new Set(introuvables.saisonsInverifiables.map((s) => `${s.equipeSlug}|${s.saison}`)) };
}

/** Plus longue série de matchs consécutifs (dans l'ordre des dates, parmi
 * les feuilles dont on dispose) avec au moins un but -- en écartant toute
 * série qu'un trou connu pourrait fausser : match manquant d'une équipe où
 * la personne a joué cette saison-là, situé dans la série ou juste à ses
 * bords (entre le dernier match sans but et le suivant). */
function meilleureSerie(lignes: Ligne[], trous: Trous): { longueur: number; debut: Date; fin: Date } | null {
	const tries = [...lignes].sort((a, b) => a.r.data.date.getTime() - b.r.data.date.getTime());
	const equipesSaisons = new Set(tries.map((l) => `${l.r.data.equipeSlug}|${l.r.data.saison}`));
	const douteuse = (i0: number, i1: number) => {
		const avant = tries[i0 - 1]?.r.data.date.getTime() ?? -Infinity;
		const apres = tries[i1 + 1]?.r.data.date.getTime() ?? Infinity;
		if (trous.rencontres.some((m) => equipesSaisons.has(`${m.equipeSlug}|${m.saison}`) && m.t > avant && m.t < apres)) return true;
		return tries.slice(i0, i1 + 1).some((l) => [...equipesSaisons].some((k) => k.endsWith(`|${l.r.data.saison}`) && trous.saisonsInverifiables.has(k)));
	};
	let meilleure: { longueur: number; debut: Date; fin: Date } | null = null;
	let debut = 0;
	for (let i = 0; i <= tries.length; i++) {
		if (i < tries.length && tries[i].buts > 0) continue;
		const longueur = i - debut;
		if (longueur > 0 && (!meilleure || longueur > meilleure.longueur) && !douteuse(debut, i - 1)) {
			meilleure = { longueur, debut: tries[debut].r.data.date, fin: tries[i - 1].r.data.date };
		}
		debut = i + 1;
	}
	return meilleure;
}

function performances(
	lignesParHash: Map<string, Ligne[]>,
	nomJoueur: Map<string, string>,
	equipeActuelle: Map<string, string>,
	nomEquipe: Map<string, string>,
	seuilArrets: number,
	trous: Trous | null,
): Classement[] {
	const classement = (titre: string, cs: Candidat[], note?: string): Classement => {
		const tous = podium(cs);
		return {
			titre,
			note,
			lignes: tous.slice(0, MAX_LIGNES).map((c) => ({
				valeur: c.texte,
				joueur: nomJoueur.get(c.hash) ?? "",
				equipe: equipeActuelle.get(c.hash) ?? "",
				contexte: c.contexte,
			})),
			autresAEgalite: Math.max(0, tous.length - MAX_LIGNES),
			// Toutes les personnes à la première place, y compris au-delà du
			// plafond de noms affichés : elles détiennent le record autant que
			// les autres (voir detenteursDeRecord()).
			detenteurs: tous.filter((c) => c.valeur === tous[0]?.valeur).map((c) => nomJoueur.get(c.hash) ?? ""),
		};
	};

	const butsMatch: Candidat[] = [];
	const arretsMatch: Candidat[] = [];
	const butsSaison: Candidat[] = [];
	const arretsSaison: Candidat[] = [];
	const matchs: Candidat[] = [];
	const arretsParMatch: Candidat[] = [];
	const series: Candidat[] = [];

	for (const [hash, lignes] of lignesParHash) {
		for (const l of lignes) {
			butsMatch.push({ valeur: l.buts, texte: String(l.buts), hash, contexte: contexteMatch(l.r, nomEquipe) });
			arretsMatch.push({ valeur: l.arrets, texte: String(l.arrets), hash, contexte: contexteMatch(l.r, nomEquipe) });
		}
		const parSaison = new Map<string, { buts: number; arrets: number }>();
		for (const l of lignes) {
			const s = parSaison.get(l.r.data.saison) ?? { buts: 0, arrets: 0 };
			s.buts += l.buts;
			s.arrets += l.arrets;
			parSaison.set(l.r.data.saison, s);
		}
		for (const [saison, s] of parSaison) {
			butsSaison.push({ valeur: s.buts, texte: String(s.buts), hash, contexte: saison });
			arretsSaison.push({ valeur: s.arrets, texte: String(s.arrets), hash, contexte: saison });
		}
		matchs.push({ valeur: lignes.length, texte: String(lignes.length), hash, contexte: "" });
		const dansLeBut = lignes.filter((l) => l.arrets > 0);
		if (dansLeBut.length >= seuilArrets) {
			const moyenne = dansLeBut.reduce((t, l) => t + l.arrets, 0) / dansLeBut.length;
			arretsParMatch.push({ valeur: moyenne, texte: unDecimal(moyenne), hash, contexte: `sur ${dansLeBut.length} matchs dans le but` });
		}
		const serie = trous ? meilleureSerie(lignes, trous) : null;
		if (serie && serie.longueur > 1) {
			series.push({
				valeur: serie.longueur,
				texte: String(serie.longueur),
				hash,
				contexte: `du ${dateLongue(serie.debut)} au ${dateLongue(serie.fin)}`,
			});
		}
	}

	const classements: Classement[] = [
		classement("Le plus de buts sur un match", butsMatch),
		classement("Le plus de buts sur une saison", butsSaison),
		classement("Le plus de matchs joués", matchs),
		classement("Le plus d'arrêts sur un match", arretsMatch),
		classement("Le plus d'arrêts sur une saison", arretsSaison),
		classement(
			"Arrêts par match",
			arretsParMatch,
			`Gardien·ne·s ayant au moins ${seuilArrets} matchs avec un arrêt ou plus. Pas de pourcentage d'arrêts individuel : la feuille de match n'indique pas quel gardien a encaissé chaque but quand deux gardiens se partagent un match.`,
		),
	];
	if (trous) {
		classements.push(
			classement(
				"Plus longue série de matchs avec au moins un but",
				series,
				"Matchs consécutifs où le joueur figure sur la feuille, dans l'ordre des dates. Une série qui englobe une rencontre dont la feuille est introuvable n'est pas retenue : elle pourrait être fausse.",
			),
		);
	}
	return classements;
}

function recordsEquipes(resultats: Resultat[], equipesOrdonnees: { slug: string; nom: string }[]): RecordsEquipe[] {
	return equipesOrdonnees
		.map(({ slug, nom }) => {
			const rs = resultats.filter((r) => r.data.equipeSlug === slug);
			const records: RecordEquipe[] = [];
			const avecScore = rs.map((r) => ({ r, s: scoreNousEux(r) })).filter((x): x is { r: Resultat; s: { nous: number; eux: number } } => x.s !== null);

			const plusDeButs = [...avecScore].sort((a, b) => b.s.nous - a.s.nous)[0];
			if (plusDeButs && plusDeButs.s.nous > 0) {
				records.push({
					titre: "Le plus de buts marqués sur un match",
					valeur: String(plusDeButs.s.nous),
					contexte: `${plusDeButs.s.nous}-${plusDeButs.s.eux} contre ${plusDeButs.r.data.adversaire}, ${dateLongue(plusDeButs.r.data.date)}`,
				});
			}
			const plusLarge = [...avecScore].sort((a, b) => b.s.nous - b.s.eux - (a.s.nous - a.s.eux))[0];
			if (plusLarge && plusLarge.s.nous > plusLarge.s.eux) {
				records.push({
					titre: "La plus large victoire",
					valeur: `+${plusLarge.s.nous - plusLarge.s.eux}`,
					contexte: `${plusLarge.s.nous}-${plusLarge.s.eux} contre ${plusLarge.r.data.adversaire}, ${dateLongue(plusLarge.r.data.date)}`,
				});
			}

			// Pourcentage d'arrêts de l'ÉQUIPE : arrêts / (arrêts + buts
			// encaissés), sans l'ambiguïté du gardien partagé qui empêche la
			// version individuelle. Meilleure saison ayant assez de matchs.
			const parSaison = new Map<string, { arrets: number; encaisses: number; matchs: number }>();
			for (const { r, s } of avecScore) {
				const stats = statsEquipeNous(r);
				if (!stats) continue;
				const t = parSaison.get(r.data.saison) ?? { arrets: 0, encaisses: 0, matchs: 0 };
				t.arrets += stats.arrets;
				t.encaisses += s.eux;
				t.matchs++;
				parSaison.set(r.data.saison, t);
			}
			const meilleure = [...parSaison]
				// Aucun arrêt sur toute une saison = arrêts non relevés sur ces
				// feuilles (format plateau des U9), pas un gardien à 0 % : exclu.
				.filter(([, t]) => t.matchs >= SEUIL_POURCENTAGE_EQUIPE && t.arrets > 0)
				.map(([saison, t]) => ({ saison, t, taux: t.arrets / (t.arrets + t.encaisses) }))
				.sort((a, b) => b.taux - a.taux)[0];
			if (meilleure) {
				records.push({
					titre: "Pourcentage d'arrêts de l'équipe sur une saison",
					valeur: pourcent(meilleure.taux),
					contexte: `${meilleure.saison} : ${meilleure.t.arrets} arrêts pour ${meilleure.t.encaisses} buts encaissés, ${meilleure.t.matchs} matchs`,
				});
			}
			return { equipe: nom, records };
		})
		.filter((e) => e.records.length > 0);
}

export async function getRecords(options: { avecSerie: boolean }): Promise<Records> {
	const [equipes, resultats] = await Promise.all([getCollection("equipes"), getCollection("resultats")]);
	const ordonnees = trierEquipes(equipes);
	const nomEquipe = new Map(equipes.map((e) => [e.data.slug, e.data.nom]));
	const actives = ordonnees.filter((e) => e.data.statut !== "archivee");
	const categorieActuelle = await categorieActuelleParHash(actives.map((e) => e.data.slug));
	const affichage = new Map(equipes.map((e) => [e.data.slug, e.data.affichageStats]));

	// Joueurs actuels affichés en nom complet : seul périmètre des
	// performances individuelles (voir l'en-tête du module).
	const nominatifs = new Set([...categorieActuelle].filter(([, slug]) => affichage.get(slug) === "nominatif").map(([hash]) => hash));
	const equipeActuelle = new Map([...categorieActuelle].filter(([h]) => nominatifs.has(h)).map(([h, slug]) => [h, nomEquipe.get(slug) ?? slug]));

	const saisonEnCours = saisonActuelle();
	const trous = options.avecSerie ? chargerTrous() : null;
	const nomJoueur = new Map<string, string>();
	const lignes = { periode: new Map<string, Ligne[]>(), saison: new Map<string, Ligne[]>() };
	// Du plus ancien au plus récent : le nom retenu est celui de la feuille la
	// plus récente (un nom d'usage peut changer).
	for (const r of [...resultats].sort((a, b) => a.data.date.getTime() - b.data.date.getTime())) {
		for (const j of r.data.statsJoueurs ?? []) {
			if (!j.licenceHash || !nominatifs.has(j.licenceHash)) continue;
			nomJoueur.set(j.licenceHash, `${formatNomPropre(j.prenom)} ${formatNomPropre(j.nom)}`);
			const ligne = { r, buts: j.buts, arrets: j.arrets };
			(lignes.periode.get(j.licenceHash) ?? lignes.periode.set(j.licenceHash, []).get(j.licenceHash)!).push(ligne);
			if (r.data.saison === saisonEnCours) {
				(lignes.saison.get(j.licenceHash) ?? lignes.saison.set(j.licenceHash, []).get(j.licenceHash)!).push(ligne);
			}
		}
	}

	const equipesOrdonnees = ordonnees.map((e) => ({ slug: e.data.slug, nom: e.data.nom }));
	const saisonsPresentes = [
		...[...lignes.periode.values()].flat().map((l) => l.r.data.saison),
		...resultats.filter((r) => scoreNousEux(r)).map((r) => r.data.saison),
	].sort();

	return {
		saisonEnCours,
		cetteSaison: {
			saisonDebut: saisonEnCours,
			performances: performances(lignes.saison, nomJoueur, equipeActuelle, nomEquipe, SEUIL_ARRETS_PAR_MATCH.saison, trous),
			equipes: recordsEquipes(
				resultats.filter((r) => r.data.saison === saisonEnCours),
				equipesOrdonnees,
			),
		},
		depuis: {
			saisonDebut: saisonsPresentes[0] ?? null,
			performances: performances(lignes.periode, nomJoueur, equipeActuelle, nomEquipe, SEUIL_ARRETS_PAR_MATCH.periode, trous),
			equipes: recordsEquipes(resultats, equipesOrdonnees),
		},
	};
}

/** Noms (tels qu'affichés, nominatifs uniquement) des personnes qui
 * détiennent au moins un record individuel de la période longue sur
 * /records -- première place d'un classement, égalités comprises. Calculé à
 * chaque build depuis les mêmes classements que la page : un record qui
 * change de main se reflète tout seul (badge de la "Carte joueur", voir
 * src/components/CarteJoueur.astro). */
export async function detenteursDeRecord(): Promise<Set<string>> {
	const { depuis } = await getRecords({ avecSerie: true });
	return new Set(depuis.performances.flatMap((c) => c.detenteurs).filter(Boolean));
}
