/**
 * Diagramme en barres en SVG inline, sans bibliothèque : une seule
 * fonction, appelée au build (buts par saison, /statistiques-carriere) comme
 * dans le navigateur (évolution match par match, /statistiques) -- même
 * géométrie, mêmes classes, donc le même rendu. Couleurs : classes stylées
 * par src/styles/graphe.css, à partir des tokens uniquement.
 *
 * Le graphique ne remplace jamais les chiffres : chaque appelant l'affiche
 * au-dessus d'un tableau qui en est l'équivalent texte.
 */

export interface PointGraphe {
	/** Sous la barre ("24-25", "12/10"). */
	libelle: string;
	/** `null` : pas de valeur (ex. efficacité d'un match sans tir) -- un
	 * trou dans le graphique, jamais une barre à zéro. */
	valeur: number | null;
}

const DIMENSIONS = { largeur: 320, hauteur: 140, marge: { haut: 18, bas: 30, gauche: 8, droite: 8 } };

/** Au-delà, valeurs et libellés se chevaucheraient sur un écran de 375 px :
 * valeurs masquées (le tableau les donne), un libellé sur deux, trois... */
const MAX_VALEURS = 16;
const MAX_LIBELLES = 8;

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svgBarres(points: PointGraphe[], ariaLabel: string): string {
	const { largeur, hauteur, marge } = DIMENSIONS;
	const max = Math.max(1, ...points.map((p) => p.valeur ?? 0));
	const pas = (largeur - marge.gauche - marge.droite) / Math.max(1, points.length);
	const utile = hauteur - marge.haut - marge.bas;
	const base = hauteur - marge.bas;
	const avecValeurs = points.length <= MAX_VALEURS;
	const tousLesN = Math.ceil(points.length / MAX_LIBELLES);

	const barres = points.map((p, i) => {
		const cx = marge.gauche + i * pas + pas / 2;
		// Toujours le dernier libellé (le plus récent), puis à rebours.
		const libelle =
			(points.length - 1 - i) % tousLesN === 0
				? `<text class="graphe-libelle" x="${cx}" y="${base + 16}" text-anchor="middle">${echapper(p.libelle)}</text>`
				: "";
		if (p.valeur === null) {
			return `<g class="graphe-vide">${libelle}<text class="graphe-valeur" x="${cx}" y="${base - 4}" text-anchor="middle">–</text></g>`;
		}
		const h = Math.round((p.valeur / max) * utile);
		const y = marge.haut + utile - h;
		const valeur = avecValeurs ? `<text class="graphe-valeur" x="${cx}" y="${y - 4}" text-anchor="middle">${p.valeur}</text>` : "";
		return `<g><rect class="graphe-barre" x="${marge.gauche + i * pas + pas * 0.2}" y="${y}" width="${pas * 0.6}" height="${Math.max(h, 1)}" rx="2" />${valeur}${libelle}</g>`;
	});

	return (
		`<svg viewBox="0 0 ${largeur} ${hauteur}" role="img" aria-label="${echapper(ariaLabel)}">` +
		`<line class="graphe-axe" x1="${marge.gauche}" x2="${largeur - marge.droite}" y1="${base}" y2="${base}" />` +
		barres.join("") +
		`</svg>`
	);
}
