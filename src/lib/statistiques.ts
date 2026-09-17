import { getCollection } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { normaliserTexte } from "./fdme/equipeMatch.mjs";
import { saisonActuelle } from "./saison";
import {
	getResultatsForEquipe,
	resultatsParSaison,
	ordreGroupesEquipe,
	grouperResultats,
	aPlusieursEquipes,
	issueDuMatch,
	scoreNousEux,
	type Resultat,
} from "./resultats";

export interface JoueurStatAffiche {
	label: string | null;
	matchsJoues: number;
	buts: number;
	sept_m: number;
	tirs: number;
	arrets: number;
	avertissements: number;
	exclusions: number;
	disqualifications: number;
}

export interface BilanEquipe {
	matchsJoues: number;
	victoires: number;
	nuls: number;
	defaites: number;
	butsPour: number;
	butsContre: number;
	diff: number;
}

export interface GroupeStatistiquesSaison {
	/** Libellé du groupe ("Équipe 1", "Équipe 2"...) -- à n'afficher que si
	 * `plusieursEquipes` est vrai sur le résultat englobant, exactement comme
	 * pour les résultats de match (voir ResultatsEquipe.astro). */
	libelle: string;
	bilan: BilanEquipe;
	joueurs: JoueurStatAffiche[];
}

export interface StatistiquesSaisonEquipe {
	saison: string;
	plusieursEquipes: boolean;
	groupes: GroupeStatistiquesSaison[];
}

/** Slugs des équipes ayant au moins un résultat -- sert à ne proposer, dans
 * le filtre de /statistiques, que des équipes ayant effectivement des
 * statistiques à montrer (compétition comme archivée : une équipe archivée
 * garde ses résultats et ses statistiques, voir CLAUDE.md). */
export async function slugsAvecResultats(): Promise<Set<string>> {
	const all = await getCollection("resultats");
	return new Set(all.map((r) => r.data.equipeSlug));
}

function bilanEquipe(resultats: Resultat[]): BilanEquipe {
	let victoires = 0;
	let nuls = 0;
	let defaites = 0;
	let butsPour = 0;
	let butsContre = 0;

	for (const r of resultats) {
		const issue = issueDuMatch(r);
		if (issue === "victoire") victoires++;
		else if (issue === "nul") nuls++;
		else defaites++;

		const score = scoreNousEux(r);
		if (score) {
			butsPour += score.nous;
			butsContre += score.eux;
		}
	}

	return { matchsJoues: resultats.length, victoires, nuls, defaites, butsPour, butsContre, diff: butsPour - butsContre };
}

type JoueurAgrege = {
	numero: number;
	nom: string;
	prenom: string;
	matchsJoues: number;
	buts: number;
	sept_m: number;
	tirs: number;
	arrets: number;
	avertissements: number;
	exclusions: number;
	disqualifications: number;
};

/** Cumule les stats individuelles de chaque feuille de match du groupe sur
 * une même ligne par joueur·se. Clé de regroupement : nom+prénom normalisés
 * (accents/casse ignorés, voir normaliserTexte()) -- le numéro de maillot
 * n'est pas une clé stable d'un match à l'autre (changements de numéro en
 * cours de saison, notamment en jeunes), contrairement au nom. Un vrai
 * homonymat (même nom ET même prénom) au sein d'une même équipe reste un cas
 * limite non résolu ici : leurs stats se cumuleraient à tort sur une seule
 * ligne -- aucun cas réel observé à ce jour dans les feuilles importées. */
function agregerJoueurs(resultats: Resultat[], affichageStats: "nominatif" | "pseudonymise" | "masque"): JoueurStatAffiche[] {
	if (affichageStats === "masque") return [];

	const parCle = new Map<string, JoueurAgrege>();
	for (const r of resultats) {
		for (const j of r.data.statsJoueurs ?? []) {
			const cle = `${normaliserTexte(j.nom)}|${normaliserTexte(j.prenom)}`;
			let a = parCle.get(cle);
			if (!a) {
				a = {
					numero: j.numero,
					nom: j.nom,
					prenom: j.prenom,
					matchsJoues: 0,
					buts: 0,
					sept_m: 0,
					tirs: 0,
					arrets: 0,
					avertissements: 0,
					exclusions: 0,
					disqualifications: 0,
				};
				parCle.set(cle, a);
			}
			a.matchsJoues++;
			a.buts += j.buts;
			a.sept_m += j.sept_m;
			a.tirs += j.tirs;
			a.arrets += j.arrets;
			a.avertissements += j.avertissements;
			a.exclusions += j.exclusions;
			if (j.disqualification) a.disqualifications++;
		}
	}
	if (parCle.size === 0) return [];

	const joueurs = [...parCle.values()];
	// disambiguateDisplayNames() attend une clé "numero" numérique stable pour
	// distinguer les homonymes au sein de l'appel : un simple index suffit,
	// même principe que individuId dans l'ancienne version FFHandball de ce
	// fichier -- ce n'est qu'une clé de Map, jamais un vrai numéro affiché.
	const pourDisambiguation = joueurs.map((j, i) => ({ numero: i, prenom: j.prenom, nom: j.nom }));
	const labels = disambiguateDisplayNames(pourDisambiguation, affichageStats);

	return joueurs
		.map((j, i) => ({ j, label: labels.get(i) ?? `${j.prenom} ${j.nom}` }))
		.sort((a, b) => b.j.buts - a.j.buts || b.j.arrets - a.j.arrets)
		.map(({ j, label }) => ({
			label,
			matchsJoues: j.matchsJoues,
			buts: j.buts,
			sept_m: j.sept_m,
			tirs: j.tirs,
			arrets: j.arrets,
			avertissements: j.avertissements,
			exclusions: j.exclusions,
			disqualifications: j.disqualifications,
		}));
}

/** Bilan d'équipe + stats joueurs cumulées, saison par saison, à partir de
 * NOTRE collection "resultats" (buts, 7m, tirs, arrêts, discipline détaillés
 * par match) -- jamais du JSON public FFHandball, plus pauvre (buts+arrêts
 * cumulés seulement) et réservé à un usage de vérification en arrière-plan
 * (voir scripts/import-stats-ffhandball.mjs). Une entrée par saison où
 * l'équipe a au moins un résultat, de la plus récente à la plus ancienne.
 * "resultats" ne contenant pas de classement de poule (place/points), le
 * bilan affiché est calculé directement depuis les scores (victoires/nuls/
 * défaites, buts pour/contre) plutôt que repris d'un classement externe. */
export async function getStatistiquesParSaison(
	equipeSlug: string,
	calendriers: { libelle?: string }[],
	affichageStats: "nominatif" | "pseudonymise" | "masque",
): Promise<StatistiquesSaisonEquipe[]> {
	const tous = await getResultatsForEquipe(equipeSlug);
	if (tous.length === 0) return [];

	const ordre = ordreGroupesEquipe(tous, calendriers);
	const plusieursEquipes = aPlusieursEquipes(tous);

	const { saisonEnCours, saisonsPrecedentes } = resultatsParSaison(tous);
	const buckets = [{ saison: saisonActuelle(), resultats: saisonEnCours }, ...saisonsPrecedentes].filter((b) => b.resultats.length > 0);

	return buckets.map(({ saison, resultats }) => ({
		saison,
		plusieursEquipes,
		groupes: grouperResultats(resultats, ordre).map((g) => ({
			libelle: g.libelle,
			bilan: bilanEquipe(g.resultats),
			joueurs: agregerJoueurs(g.resultats, affichageStats),
		})),
	}));
}
