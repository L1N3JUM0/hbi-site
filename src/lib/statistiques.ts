import { getCollection } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { libelleEquipeAffiche } from "./resultats";

export interface JoueurStatAffiche {
	label: string | null;
	matchCount: number;
	totalButs: number;
	totalArrets: number;
}

export interface ClassementAffiche {
	place: number;
	point: number;
	joue: number;
	gagne: number;
	nul: number;
	perdu: number;
	butPlus: number;
	butMoins: number;
	diff: number;
}

export interface GroupeStatistiques {
	/** Libellé du groupe ("Équipe 1", "Équipe 2"...) -- à n'afficher que si
	 * `plusieursEquipes` est vrai sur le résultat englobant, exactement comme
	 * pour les résultats de match (voir ResultatsEquipe.astro). */
	libelle: string;
	classement: ClassementAffiche | null;
	joueurs: JoueurStatAffiche[];
}

export interface StatistiquesEquipe {
	plusieursEquipes: boolean;
	groupes: GroupeStatistiques[];
}

type JoueurBrut = { individuId: string; nom: string; prenom: string; matchCount: number; totalButs: number; totalArrets: number };

/** Slugs des équipes ayant au moins une donnée dans la collection
 * "statistiquesPoules" -- sert à ne proposer, dans le filtre de
 * /statistiques, que des équipes qui ont effectivement un `statistiquesUrl`
 * renseigné (et dont l'import a réussi). */
export async function slugsAvecStatistiques(): Promise<Set<string>> {
	const poules = await getCollection("statistiquesPoules");
	const slugs = new Set<string>();
	for (const p of poules) {
		for (const c of p.data.classement) slugs.add(c.equipeSlug);
		for (const j of p.data.joueurs) slugs.add(j.equipeSlug);
	}
	return slugs;
}

function formatterJoueurs(joueurs: JoueurBrut[], affichageStats: "nominatif" | "pseudonymise" | "masque"): JoueurStatAffiche[] {
	if (affichageStats === "masque" || joueurs.length === 0) return [];
	// disambiguateDisplayNames() attend une clé "numero" numérique pour
	// distinguer les homonymes -- individuId (identifiant technique
	// FFHandball, jamais affiché) en tient lieu ici, il n'a pas besoin d'être
	// un vrai numéro de maillot pour ça.
	const pourDisambiguation = joueurs.map((j) => ({ numero: Number(j.individuId), prenom: j.prenom, nom: j.nom }));
	const labels = disambiguateDisplayNames(pourDisambiguation, affichageStats);
	return [...joueurs]
		.sort((a, b) => b.totalButs - a.totalButs || b.totalArrets - a.totalArrets)
		.map((j) => ({
			label: labels.get(Number(j.individuId)) ?? `${j.prenom} ${j.nom}`,
			matchCount: j.matchCount,
			totalButs: j.totalButs,
			totalArrets: j.totalArrets,
		}));
}

/** Classement + stats joueurs (saison en cours, agrégées par la FFHandball)
 * d'une équipe du club. Regroupé par `equipeNumero` uniquement quand la
 * catégorie en compte plusieurs partageant la même poule (ex. Seniors
 * masculins 1 et 2) -- une seule équipe dans sa catégorie n'a alors qu'un
 * seul groupe, sans libellé à afficher (voir `plusieursEquipes`), même
 * principe que `aPlusieursEquipes`/ListeResultats.astro pour les résultats
 * de match. */
export async function getStatistiquesPourEquipe(
	equipeSlug: string,
	affichageStats: "nominatif" | "pseudonymise" | "masque",
): Promise<StatistiquesEquipe> {
	const poules = await getCollection("statistiquesPoules");

	const numeros = new Set<string>();
	for (const p of poules) {
		for (const c of p.data.classement) if (c.equipeSlug === equipeSlug) numeros.add(c.equipeNumero ?? "");
		for (const j of p.data.joueurs) if (j.equipeSlug === equipeSlug) numeros.add(j.equipeNumero ?? "");
	}
	const plusieursEquipes = numeros.size > 1;

	const groupes = [...numeros]
		.map((numero) => {
			let classement: ClassementAffiche | null = null;
			const joueursBruts: JoueurBrut[] = [];

			for (const p of poules) {
				const ligne = p.data.classement.find((c) => c.equipeSlug === equipeSlug && (c.equipeNumero ?? "") === numero);
				if (ligne) {
					classement = {
						place: ligne.place,
						point: ligne.point,
						joue: ligne.joue,
						gagne: ligne.gagne,
						nul: ligne.nul,
						perdu: ligne.perdu,
						butPlus: ligne.butPlus,
						butMoins: ligne.butMoins,
						diff: ligne.diff,
					};
				}
				joueursBruts.push(...p.data.joueurs.filter((j) => j.equipeSlug === equipeSlug && (j.equipeNumero ?? "") === numero));
			}

			return {
				libelle: libelleEquipeAffiche(numero || undefined),
				classement,
				joueurs: formatterJoueurs(joueursBruts, affichageStats),
			};
		})
		.sort((a, b) => a.libelle.localeCompare(b.libelle, "fr", { numeric: true }));

	return { plusieursEquipes, groupes };
}
