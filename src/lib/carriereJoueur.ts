import { getCollection } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { getResultatsForEquipe, resultatsParSaison, ordreGroupesEquipe, grouperResultats, aPlusieursEquipes, type Resultat } from "./resultats";

export interface EtapeCarriere {
	saison: string;
	equipeNom: string;
}

export interface JoueurCarriere {
	label: string | null;
	matchsJoues: number;
	buts: number;
	sept_m: number;
	tirs: number;
	arrets: number;
	avertissements: number;
	exclusions: number;
	disqualifications: number;
	/** Saisons/équipes traversées, de la plus ancienne à la plus récente --
	 * un cumul de carrière n'a de sens que si la progression qui le compose
	 * reste visible, jamais un total seul sans contexte. */
	parcours: EtapeCarriere[];
}

export interface GroupeCarriere {
	/** Libellé du groupe ("Équipe 1", "Équipe 2"...) -- à n'afficher que si
	 * `plusieursEquipes` est vrai, même principe que pour /statistiques. */
	libelle: string;
	joueurs: JoueurCarriere[];
}

export interface CarriereEquipe {
	plusieursEquipes: boolean;
	groupes: GroupeCarriere[];
}

type Agregat = {
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
	parcours: Map<string, string>;
};

/** Cumule, pour un ensemble donné de `licenceHash` (l'effectif actuel d'une
 * équipe -- voir `getCarriereParEquipe`), leurs stats sur TOUTE la
 * collection "resultats" : toute équipe, toute saison. C'est le cœur de la
 * règle voulue pour cette page -- la pseudonymisation est une règle
 * d'affichage selon la catégorie ACTUELLE (le paramètre `affichageStats`
 * ci-dessous, celui de l'équipe consultée), jamais une restriction sur les
 * données cumulées elles-mêmes : un·e joueur·se qui a changé de catégorie
 * voit ses stats des catégories précédentes comptées tout autant que celles
 * de la catégorie actuelle. */
function agregerCarriere(
	hashesEffectifActuel: Set<string>,
	tousLesResultats: Resultat[],
	nomEquipe: Map<string, string>,
	affichageStats: "nominatif" | "pseudonymise" | "masque",
): JoueurCarriere[] {
	if (affichageStats === "masque" || hashesEffectifActuel.size === 0) return [];

	const parHash = new Map<string, Agregat>();
	for (const hash of hashesEffectifActuel) {
		parHash.set(hash, {
			nom: "",
			prenom: "",
			matchsJoues: 0,
			buts: 0,
			sept_m: 0,
			tirs: 0,
			arrets: 0,
			avertissements: 0,
			exclusions: 0,
			disqualifications: 0,
			parcours: new Map(),
		});
	}

	for (const r of tousLesResultats) {
		for (const j of r.data.statsJoueurs ?? []) {
			if (!j.licenceHash) continue;
			const a = parHash.get(j.licenceHash);
			if (!a) continue; // pas dans l'effectif actuel de l'équipe consultée : hors périmètre ici.
			a.nom = j.nom;
			a.prenom = j.prenom;
			a.matchsJoues++;
			a.buts += j.buts;
			a.sept_m += j.sept_m;
			a.tirs += j.tirs;
			a.arrets += j.arrets;
			a.avertissements += j.avertissements;
			a.exclusions += j.exclusions;
			if (j.disqualification) a.disqualifications++;
			// Une seule étape par saison (la première équipe rencontrée dans
			// l'ordre de parcours des résultats) : suffisant pour montrer la
			// progression, un double surclassement la même saison resterait un
			// cas limite non distingué ici.
			if (!a.parcours.has(r.data.saison)) a.parcours.set(r.data.saison, r.data.equipeSlug);
		}
	}

	const joueurs = [...parHash.values()];
	// disambiguateDisplayNames() attend une clé "numero" numérique stable pour
	// distinguer les homonymes au sein de l'appel : un simple index suffit,
	// ce n'est qu'une clé de Map, jamais un vrai numéro de maillot affiché
	// (voir la même construction dans src/lib/statistiques.ts).
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
			parcours: [...j.parcours.entries()]
				.sort(([a], [b]) => (a < b ? -1 : 1))
				.map(([saison, slug]) => ({ saison, equipeNom: nomEquipe.get(slug) ?? slug })),
		}));
}

/** Statistiques de carrière (toutes saisons, toutes catégories confondues)
 * de l'effectif ACTUEL d'une équipe -- "actuel" au sens de la saison la plus
 * récente pour laquelle cette équipe a des résultats (la saison en cours si
 * elle en a déjà, sinon la plus récente saison archivée pour une équipe qui
 * a cessé de jouer). Contrairement à /statistiques (bilan d'UNE saison),
 * chaque ligne ici cumule le parcours complet d'un·e joueur·se, y compris
 * dans d'autres catégories que celle-ci. */
export async function getCarriereParEquipe(
	equipeSlug: string,
	calendriers: { libelle?: string }[],
	affichageStats: "nominatif" | "pseudonymise" | "masque",
): Promise<CarriereEquipe> {
	const tous = await getResultatsForEquipe(equipeSlug);
	if (tous.length === 0) return { plusieursEquipes: false, groupes: [] };

	const ordre = ordreGroupesEquipe(tous, calendriers);
	const plusieursEquipes = aPlusieursEquipes(tous);

	const { saisonEnCours, saisonsPrecedentes } = resultatsParSaison(tous);
	const effectifActuel = saisonEnCours.length > 0 ? saisonEnCours : (saisonsPrecedentes[0]?.resultats ?? []);
	const groupesEffectif = grouperResultats(effectifActuel, ordre);

	const [toutesEquipes, tousLesResultats] = await Promise.all([getCollection("equipes"), getCollection("resultats")]);
	const nomEquipe = new Map(toutesEquipes.map((e) => [e.data.slug, e.data.nom]));

	const groupes = groupesEffectif.map((g) => {
		const hashes = new Set<string>();
		for (const r of g.resultats) for (const j of r.data.statsJoueurs ?? []) if (j.licenceHash) hashes.add(j.licenceHash);
		return { libelle: g.libelle, joueurs: agregerCarriere(hashes, tousLesResultats, nomEquipe, affichageStats) };
	});

	return { plusieursEquipes, groupes };
}
