import type { CollectionEntry } from "astro:content";

type Equipe = CollectionEntry<"equipes">;

const RANG_GENRE: Record<string, number> = { feminin: 0, mixte: 0, masculin: 1 };

/** "U13" -> 13, "senior" -> 90 (au-delà de tout âge réel, mais fini -- une
 * exception manuelle peut donc encore se placer après grâce à `ordre`, voir
 * plus bas). */
function rangAge(categorieAge: string): number {
	return categorieAge === "senior" ? 90 : Number(categorieAge.slice(1));
}

/** Rang de tri d'une équipe, ou `null` si aucun rang ne peut être déterminé
 * (pas de catégorie d'âge ET pas d'ordre manuel -- l'équipe se place alors en
 * dernier, voir trierEquipes()). */
function rang(equipe: Equipe): number | null {
	const { categorieAge, genre, ordre } = equipe.data;
	// Catégorie d'âge renseignée (le cas courant : toute équipe engagée dans
	// un championnat classé par âge) : rang calculé, `ordre` est ignoré même
	// s'il est renseigné par erreur -- une seule source de vérité pour ce cas.
	if (categorieAge) return rangAge(categorieAge) * 10 + (genre ? RANG_GENRE[genre] : 0);
	// Pas de catégorie d'âge (Loisirs, Découverte, Inclusion, créneau
	// transversal) : `ordre` sert d'exception manuelle, à renseigner à la
	// main dans le CMS.
	if (ordre != null) return ordre;
	return null;
}

/** Trie les équipes pour l'affichage (page d'accueil, /equipes, /rejoindre) :
 * du plus jeune au plus âgé pour toute équipe ayant une catégorie d'âge,
 * sans aucune saisie requise ; selon `ordre` pour les créneaux qui n'en ont
 * pas (exceptions éditoriales) ; en tout dernier recours (aucun des deux
 * renseigné -- ne devrait pas arriver, garde-fou) par ordre alphabétique, pour
 * ne jamais faire disparaître une équipe ni la placer au hasard. */
export function trierEquipes<T extends Equipe>(equipes: T[]): T[] {
	return [...equipes].sort((a, b) => {
		const rangA = rang(a);
		const rangB = rang(b);
		if (rangA != null && rangB != null) {
			if (rangA !== rangB) return rangA - rangB;
		} else if (rangA != null) {
			return -1;
		} else if (rangB != null) {
			return 1;
		}
		return a.data.nom.localeCompare(b.data.nom, "fr");
	});
}
