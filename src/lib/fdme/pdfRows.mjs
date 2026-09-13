import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Regroupe le texte d'un PDF en "lignes" positionnées : chaque ligne porte
 * le numéro de page et la liste de ses fragments de texte, triés de gauche
 * à droite, avec leur position horizontale (x, en points PDF).
 *
 * On utilise les coordonnées réelles du PDF (via pdfjs-dist) plutôt qu'un
 * texte "à plat" façon `pdftotext -layout` : une feuille de match FFHandball
 * a des colonnes de stats très resserrées (Buts/7m/Tirs/Arrets/Av./2'/Dis)
 * qu'une simple grille de caractères n'aligne pas de façon fiable (deux
 * colonnes voisines peuvent se confondre). Les coordonnées x/y de pdfjs
 * permettent de rattacher chaque valeur à la colonne d'en-tête la plus
 * proche, sans ambiguïté -- voir parseFeuille.mjs.
 *
 * `useSystemFonts: true` : on n'a pas besoin d'un rendu visuel fidèle, ce
 * PDF est un simple export texte de la FFHandball, pas de police custom
 * à charger.
 */
/** Deux fragments à moins de cette distance verticale (en points PDF) sont
 * considérés comme faisant partie de la même ligne visuelle. Calibré sur
 * des feuilles réelles : certains couples label/valeur de l'en-tête ont un
 * décalage de 3-4pt (police différente), alors que deux lignes distinctes
 * sont toujours espacées d'au moins ~10pt sur ce gabarit. */
const SAME_ROW_TOLERANCE = 6;

export async function extractRows(pdfBytes) {
	const doc = await getDocument({ data: pdfBytes, useSystemFonts: true, isEvalSupported: false }).promise;
	const fragments = [];

	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const content = await page.getTextContent();
		for (const item of content.items) {
			const str = item.str;
			if (!str || !str.trim()) continue;
			fragments.push({ page: pageNum, x: item.transform[4], y: item.transform[5], str: str.trim() });
		}
	}
	// Origine PDF en bas de page : page croissante, puis y décroissant pour
	// lire de haut en bas.
	fragments.sort((a, b) => (a.page !== b.page ? a.page - b.page : b.y - a.y));

	const rows = [];
	for (const frag of fragments) {
		const current = rows[rows.length - 1];
		if (current && current.page === frag.page && Math.abs(current.y - frag.y) <= SAME_ROW_TOLERANCE) {
			current.items.push(frag);
			// Référence de ligne = y du premier fragment, pour ne pas dériver
			// progressivement sur une longue ligne.
		} else {
			rows.push({ page: frag.page, y: frag.y, items: [frag] });
		}
	}
	for (const row of rows) row.items.sort((a, b) => a.x - b.x);
	return rows;
}

/** Concatène tout le texte d'une ligne (dans l'ordre de lecture), pour les
 * recherches simples type regex sur les champs d'en-tête. */
export function rowText(row) {
	return row.items.map((i) => i.str).join(" ");
}

/** Le fragment de texte de `row` dont le x est le plus proche de `x` --
 * c'est ce qui permet de rattacher une valeur à sa colonne d'en-tête sans
 * dépendre d'un alignement exact au caractère près. Renvoie `null` si la
 * ligne n'a aucun fragment à moins de `maxDistance` points. */
export function nearestItem(row, x, maxDistance = Infinity) {
	let best = null;
	let bestDist = Infinity;
	for (const item of row.items) {
		const dist = Math.abs(item.x - x);
		if (dist < bestDist) {
			best = item;
			bestDist = dist;
		}
	}
	return best && bestDist <= maxDistance ? best : null;
}
