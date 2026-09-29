import { getCollection } from "astro:content";
import { disambiguateDisplayNames } from "./fdme/noms.mjs";
import { getResultatsForEquipe, resultatsParSaison, ordreGroupesEquipe, grouperResultats, aPlusieursEquipes, type Resultat } from "./resultats";

export interface EtapeCarriere {
	saison: string;
	equipeNom: string;
}

/** Détail d'une étape de carrière (une saison dans une équipe donnée) avec
 * ses propres statistiques -- contrairement à `EtapeCarriere` ci-dessus, qui
 * ne sert qu'à afficher le fil du parcours. Uniquement construit quand
 * `affichageStats` vaut "nominatif" (voir `agregerCarriere`) : jamais pour un
 * affichage pseudonymisé, où un détail saison par saison, même sans nom
 * complet, risquerait de permettre une ré-identification par recoupement. */
export interface EtapeDetailCarriere {
	saison: string;
	equipeNom: string;
	matchsJoues: number;
	buts: number;
	sept_m: number;
	tirs: number;
	arrets: number;
	avertissements: number;
	exclusions: number;
	disqualifications: number;
	/** Buts / matchs joués, arrondi à une décimale -- `null` si aucun match. */
	ratio: number | null;
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
	/** Buts / matchs joués, arrondi à une décimale -- `null` si aucun match. */
	ratio: number | null;
	/** Saisons/équipes traversées, de la plus ancienne à la plus récente --
	 * un cumul de carrière n'a de sens que si la progression qui le compose
	 * reste visible, jamais un total seul sans contexte. */
	parcours: EtapeCarriere[];
	/** Libellé du groupe de rattachement (voir `GroupeCarriere.libelle`),
	 * porté sur chaque joueur pour permettre un tri par "catégorie" dans un
	 * tableau qui fusionnerait tous les groupes d'une équipe. */
	groupeLibelle: string;
	/** Détail saison par saison / catégorie par catégorie -- `null` si
	 * l'affichage n'est pas nominatif (voir `EtapeDetailCarriere`) : c'est ce
	 * qui empêche toute vue individuelle pour un·e joueur·se encore affiché·e
	 * en mode pseudonymisé. */
	detail: EtapeDetailCarriere[] | null;
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

type DetailBucket = {
	saison: string;
	equipeSlug: string;
	matchsJoues: number;
	buts: number;
	sept_m: number;
	tirs: number;
	arrets: number;
	avertissements: number;
	exclusions: number;
	disqualifications: number;
};

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
	/** Une entrée par (saison, équipe) traversée -- clé `${saison}\0${equipeSlug}`
	 * pour distinguer un double surclassement la même saison, ce que `parcours`
	 * ci-dessus ne fait volontairement pas (voir son commentaire). */
	detail: Map<string, DetailBucket>;
};

function arrondiRatio(buts: number, matchsJoues: number): number | null {
	if (matchsJoues === 0) return null;
	return Math.round((buts / matchsJoues) * 10) / 10;
}

/** Cumule, pour un ensemble donné de `licenceHash` (l'effectif actuel d'une
 * équipe -- voir `getCarriereParEquipe`), leurs stats sur TOUTE la
 * collection "resultats" : toute équipe, toute saison. C'est le cœur de la
 * règle voulue pour cette page -- la pseudonymisation est une règle
 * d'affichage selon la catégorie ACTUELLE (le paramètre `affichageStats`
 * ci-dessous, celui de l'équipe consultée), jamais une restriction sur les
 * données cumulées elles-mêmes : un·e joueur·se qui a changé de catégorie
 * voit ses stats des catégories précédentes comptées tout autant que celles
 * de la catégorie actuelle.
 *
 * `hashesVersLibelle` associe chaque empreinte de licence à SON libellé de
 * groupe ("Équipe 1", "Équipe 1 & Équipe 2"...) -- une seule entrée par
 * empreinte, jamais un hash traité deux fois pour deux groupes différents :
 * c'est ce qui empêche un·e même joueur·se de ressortir dupliqué·e avec des
 * totaux identiques quand il/elle a joué dans plusieurs groupes de la même
 * catégorie cette saison (voir getCarriereParEquipe, qui construit ce libellé
 * combiné AVANT d'appeler cette fonction, une seule fois par catégorie plutôt
 * qu'une fois par groupe). */
function agregerCarriere(
	hashesVersLibelle: Map<string, string>,
	tousLesResultats: Resultat[],
	nomEquipe: Map<string, string>,
	affichageStats: "nominatif" | "pseudonymise" | "masque",
): JoueurCarriere[] {
	if (affichageStats === "masque" || hashesVersLibelle.size === 0) return [];

	const parHash = new Map<string, Agregat>();
	for (const hash of hashesVersLibelle.keys()) {
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
			detail: new Map(),
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

			// Détail par (saison, équipe) -- contrairement à `parcours`
			// ci-dessus, distingue un double surclassement la même saison, et
			// porte ses propres stats. Construit pour tout le monde ici (peu
			// coûteux) ; c'est seulement à la sortie, plus bas, qu'il est
			// jeté pour un affichage non nominatif.
			const cleDetail = `${r.data.saison}\0${r.data.equipeSlug}`;
			let bucket = a.detail.get(cleDetail);
			if (!bucket) {
				bucket = {
					saison: r.data.saison,
					equipeSlug: r.data.equipeSlug,
					matchsJoues: 0,
					buts: 0,
					sept_m: 0,
					tirs: 0,
					arrets: 0,
					avertissements: 0,
					exclusions: 0,
					disqualifications: 0,
				};
				a.detail.set(cleDetail, bucket);
			}
			bucket.matchsJoues++;
			bucket.buts += j.buts;
			bucket.sept_m += j.sept_m;
			bucket.tirs += j.tirs;
			bucket.arrets += j.arrets;
			bucket.avertissements += j.avertissements;
			bucket.exclusions += j.exclusions;
			if (j.disqualification) bucket.disqualifications++;
		}
	}

	const joueurs = [...parHash.entries()];
	// disambiguateDisplayNames() attend une clé "numero" numérique stable pour
	// distinguer les homonymes au sein de l'appel : un simple index suffit,
	// ce n'est qu'une clé de Map, jamais un vrai numéro de maillot affiché
	// (voir la même construction dans src/lib/statistiques.ts).
	const pourDisambiguation = joueurs.map(([, j], i) => ({ numero: i, prenom: j.prenom, nom: j.nom }));
	const labels = disambiguateDisplayNames(pourDisambiguation, affichageStats);

	return joueurs
		.map(([hash, j], i) => ({ hash, j, label: labels.get(i) ?? `${j.prenom} ${j.nom}` }))
		.sort((a, b) => b.j.buts - a.j.buts || b.j.arrets - a.j.arrets)
		.map(({ hash, j, label }) => ({
			label,
			matchsJoues: j.matchsJoues,
			buts: j.buts,
			sept_m: j.sept_m,
			tirs: j.tirs,
			arrets: j.arrets,
			avertissements: j.avertissements,
			exclusions: j.exclusions,
			disqualifications: j.disqualifications,
			ratio: arrondiRatio(j.buts, j.matchsJoues),
			groupeLibelle: hashesVersLibelle.get(hash) ?? "",
			parcours: [...j.parcours.entries()]
				.sort(([a], [b]) => (a < b ? -1 : 1))
				.map(([saison, slug]) => ({ saison, equipeNom: nomEquipe.get(slug) ?? slug })),
			// Confidentialité : jamais construit hors du mode "nominatif" --
			// un détail saison par saison, même pseudonymisé, pourrait
			// permettre de ré-identifier quelqu'un par recoupement (ex. un·e
			// seul·e "Théo M." dans une petite catégorie sur plusieurs
			// saisons). Voir la page /statistiques-carriere, qui n'ouvre
			// aucune vue individuelle quand `detail` est `null`.
			detail:
				affichageStats === "nominatif"
					? [...j.detail.values()]
							.sort((a, b) => (a.saison < b.saison ? -1 : a.saison > b.saison ? 1 : a.equipeSlug.localeCompare(b.equipeSlug)))
							.map((b) => ({
								saison: b.saison,
								equipeNom: nomEquipe.get(b.equipeSlug) ?? b.equipeSlug,
								matchsJoues: b.matchsJoues,
								buts: b.buts,
								sept_m: b.sept_m,
								tirs: b.tirs,
								arrets: b.arrets,
								avertissements: b.avertissements,
								exclusions: b.exclusions,
								disqualifications: b.disqualifications,
								ratio: arrondiRatio(b.buts, b.matchsJoues),
							}))
					: null,
		}));
}

/** Catégorie ACTUELLE de chaque joueur·se, pour qu'il/elle n'apparaisse
 * qu'UNE fois sur /statistiques-carriere (demande du 29/09/2026 : jusque-là,
 * une personne ayant joué dans deux catégories cette saison ressortait dans
 * chacune avec le même total de carrière, jusqu'à trois fois avec les
 * équipes archivées). C'est aussi cette catégorie qui fixe le mode
 * d'affichage (nominatif ou pseudonymisé) de sa ligne.
 *
 * Parmi les équipes données (actives, du plus jeune au plus âgé), celle dont
 * l'effectif de référence (saison en cours, sinon dernière saison jouée par
 * l'équipe -- même règle que getCarriereParEquipe) est le plus récent ; à
 * saison égale, celle où la personne a joué le plus de matchs ; à égalité
 * encore, la catégorie la plus âgée -- un choix stable, jamais arbitraire
 * d'un build à l'autre. */
export async function categorieActuelleParHash(slugsDuPlusJeuneAuPlusAge: string[]): Promise<Map<string, string>> {
	type Candidat = { slug: string; saison: string; matchs: number; rang: number };
	const meilleur = new Map<string, Candidat>();
	for (const [rang, slug] of slugsDuPlusJeuneAuPlusAge.entries()) {
		const { saisonEnCours, saisonsPrecedentes } = resultatsParSaison(await getResultatsForEquipe(slug));
		const effectif = saisonEnCours.length > 0 ? saisonEnCours : (saisonsPrecedentes[0]?.resultats ?? []);
		if (effectif.length === 0) continue;
		const saison = effectif[0].data.saison;
		const matchs = new Map<string, number>();
		for (const r of effectif) {
			for (const j of r.data.statsJoueurs ?? []) {
				if (j.licenceHash) matchs.set(j.licenceHash, (matchs.get(j.licenceHash) ?? 0) + 1);
			}
		}
		for (const [hash, n] of matchs) {
			const actuel = meilleur.get(hash);
			const candidat = { slug, saison, matchs: n, rang };
			const mieux =
				!actuel ||
				saison > actuel.saison ||
				(saison === actuel.saison && (n > actuel.matchs || (n === actuel.matchs && rang > actuel.rang)));
			if (mieux) meilleur.set(hash, candidat);
		}
	}
	return new Map([...meilleur].map(([hash, c]) => [hash, c.slug]));
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
	/** Voir categorieActuelleParHash() : seules les personnes rattachées à
	 * CETTE équipe y sont listées. */
	categorieActuelle: Map<string, string>,
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

	// Un·e même joueur·se peut avoir joué cette saison dans PLUSIEURS groupes
	// de cette catégorie (ex. un gardien qui dépanne Équipe 1 ET Équipe 2) :
	// cette page parle du parcours d'une PERSONNE, pas de quelle équipe
	// numérotée l'a accueilli·e un soir donné -- une seule ligne par
	// joueur·se, jamais éclatée par groupe (voir la demande du 28/09/2026,
	// constatée sur Jean-François Pineda et Thierry Duclaux, apparus deux
	// fois avec des totaux identiques). On construit donc d'abord, PAR
	// EMPREINTE DE LICENCE, la liste des groupes traversés cette saison (dans
	// l'ordre canonique de `ordre`), puis on n'appelle agregerCarriere()
	// qu'UNE SEULE FOIS pour toute la catégorie (plutôt qu'une fois par
	// groupe) avec un libellé qui les combine ("Équipe 1 & Équipe 2") quand
	// plusieurs s'appliquent -- jamais un choix arbitraire entre les deux.
	const groupesParHash = new Map<string, string[]>();
	for (const g of groupesEffectif) {
		for (const r of g.resultats) {
			for (const j of r.data.statsJoueurs ?? []) {
				if (!j.licenceHash || categorieActuelle.get(j.licenceHash) !== equipeSlug) continue;
				const libelles = groupesParHash.get(j.licenceHash) ?? [];
				if (!libelles.includes(g.libelle)) libelles.push(g.libelle);
				groupesParHash.set(j.licenceHash, libelles);
			}
		}
	}
	const hashesVersLibelle = new Map<string, string>();
	for (const [hash, libelles] of groupesParHash) hashesVersLibelle.set(hash, libelles.join(" & "));

	const joueurs = agregerCarriere(hashesVersLibelle, tousLesResultats, nomEquipe, affichageStats);

	// Rebucketé par libellé de groupe pour l'affichage (voir GroupeCarriere) :
	// un·e joueur·se au libellé combiné ("Équipe 1 & Équipe 2") forme son
	// propre groupe, distinct des deux groupes d'origine -- jamais rangé·e
	// arbitrairement dans l'un des deux. `ordre` ci-dessus ne connaît pas ces
	// libellés combinés (calculés seulement ici) : ils sont ajoutés à la
	// suite, dans l'ordre où ils apparaissent parmi les joueur·se·s déjà
	// triés par agregerCarriere().
	const parGroupeLibelle = new Map<string, JoueurCarriere[]>();
	for (const j of joueurs) {
		const liste = parGroupeLibelle.get(j.groupeLibelle) ?? [];
		liste.push(j);
		parGroupeLibelle.set(j.groupeLibelle, liste);
	}
	const libellesConnus = new Set(ordre.map((g) => g.libelle));
	const ordreAffichage = [...ordre.map((g) => g.libelle), ...[...parGroupeLibelle.keys()].filter((l) => !libellesConnus.has(l))];
	const groupes = ordreAffichage.filter((l) => parGroupeLibelle.has(l)).map((libelle) => ({ libelle, joueurs: parGroupeLibelle.get(libelle)! }));

	return { plusieursEquipes, groupes };
}
