/**
 * Logique pure (sans réseau ni fichier) de la récupération automatique des
 * feuilles de match -- voir scripts/recuperer-feuilles.mjs pour
 * l'orchestration et le détail du fonctionnement. Séparée pour être testable
 * seule sur des pages et calendriers réels enregistrés.
 */
import ical from "node-ical";

/** PDF téléchargés automatiquement, en attente d'extraction par
 * import-fdme.mjs dans le même build : dossier ignoré par git (voir
 * .gitignore), jamais celui des feuilles du CMS. */
export const DOSSIER_TEMPORAIRE = ".feuilles-auto";
/** Suivi des rencontres déjà examinées (commité par le workflow). */
export const ETAT_PATH = "src/data/feuilles-auto.json";

/** Laisse le temps au match de se terminer et à la table de marque de
 * transmettre la feuille avant la première tentative. */
export const DELAI_APRES_DEBUT_MS = 2 * 60 * 60 * 1000;
/** Délai (décision du club) après lequel une feuille toujours introuvable
 * alors que la fédération affiche un score est déclarée "abandonnée" et
 * demandée en dépôt manuel -- les tentatives continuent quand même. */
export const DELAI_ABANDON_MS = 21 * 24 * 60 * 60 * 1000;
/** Durée d'affichage de l'alerte "équipe du calendrier différente de la
 * détection" : simple vérification à faire, pas une erreur à corriger (le
 * calendrier fait foi), inutile qu'elle reste affichée indéfiniment. */
export const DUREE_ALERTE_DIVERGENCE_MS = 14 * 24 * 60 * 60 * 1000;

/** Statuts dans lesquels il n'y a plus rien à faire pour une rencontre. */
export const STATUTS_TERMINES = new Set(["importee", "forfait_cree", "ignoree"]);

/** Même extraction que scripts/import-stats-ffhandball.mjs : ffhandball.fr
 * injecte le JSON de chaque composant dans le HTML rendu côté serveur. */
export function extraireComposant(html, nom) {
	const correspondance = new RegExp(`name='${nom}' attributes="([^"]*)"`).exec(html);
	if (!correspondance) return null;
	try {
		return JSON.parse(
			correspondance[1]
				.replace(/&quot;/g, '"')
				.replace(/&#0?39;/g, "'")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/&amp;/g, "&"),
		);
	} catch {
		return null;
	}
}

/** @returns {{ uid: string, debut: Date, titre: string, competition: string, journee?: string, url?: string }[]} */
export function lireCalendrier(texteIcs) {
	const texte = (v) => (v == null ? "" : typeof v === "string" ? v : String(v.val ?? ""));
	return Object.values(ical.parseICS(texteIcs))
		.filter((e) => e?.type === "VEVENT" && e.start)
		.map((e) => {
			const description = texte(e.description);
			const numeroJournee = /Journ[ée]e\s+(\d+)/i.exec(description)?.[1];
			return {
				uid: String(e.uid),
				debut: new Date(e.start),
				titre: texte(e.summary),
				// "DIVISION 1 MASCULINS - Journée 1" -> "DIVISION 1 MASCULINS"
				competition: description.replace(/\s+-\s+Journ[ée]e.*$/i, "").trim(),
				// Même forme que sur les feuilles ("J1"), voir parseFeuille.mjs.
				journee: numeroJournee ? `J${numeroJournee}` : undefined,
				url: e.url ? String(e.url) : undefined,
			};
		});
}

function camps(titre) {
	const parts = titre.split(/\s+vs\s+/i);
	return parts.length === 2 ? parts.map((p) => p.trim()) : null;
}

/**
 * Quelle équipe du club joue cet événement, d'après les calendriers déclarés
 * pour ce flux (même règle que src/lib/agenda.ts : le `repere` du CMS doit
 * figurer dans le nom du camp ; le plus long gagne, pour que « Handball
 * Islois 2 » ne soit pas pris pour « Handball Islois »).
 * @param {{ titre: string }} evenement
 * @param {{ equipeSlug: string, repere: string, libelle?: string }[]} calendriersDuFlux
 * @returns {{ equipeSlug: string, equipeNumero?: string, domicile: boolean, adversaire: string } | { derby: true } | null}
 */
export function equipeDepuisCalendrier(evenement, calendriersDuFlux) {
	const cotes = camps(evenement.titre);
	if (!cotes) return null;
	const trouver = (nom) =>
		calendriersDuFlux
			.filter((c) => c.repere && nom.toLowerCase().includes(c.repere.toLowerCase()))
			.sort((a, b) => b.repere.length - a.repere.length)[0];
	const [a, b] = cotes.map(trouver);
	if (a && b) return { derby: true };
	const nous = a ?? b;
	if (!nous) return null;
	return {
		equipeSlug: nous.equipeSlug,
		equipeNumero: nous.libelle || undefined,
		domicile: Boolean(a),
		adversaire: a ? cotes[1] : cotes[0],
	};
}

/** Ce que la page d'une rencontre sur ffhandball.fr dit du match. */
export function lireRencontre(html) {
	const score = extraireComposant(html, "competitions---competition-score");
	if (!score) return null;
	const url = extraireComposant(html, "competitions---rencontre-fdm-button")?.url ?? "";
	return {
		// Le bouton "feuille de match" est affiché même pour un match jamais
		// joué (PDF alors en 404) : sa présence ne prouve rien, seul le code
		// qu'il porte est utile.
		code: /\/([A-Z]{7})\.pdf$/.exec(url)?.[1] ?? null,
		scoreDomicile: score.home?.score ?? null,
		scoreExterieur: score.away?.score ?? null,
		nomDomicile: score.home?.name ?? "",
		nomExterieur: score.away?.name ?? "",
		statut: score.status ?? null,
	};
}

const estNombre = (v) => typeof v === "string" && /^\d+$/.test(v);

/**
 * "joue" : score numérique des deux côtés. "non_joue" : aucun score (match
 * pas encore joué, reporté sans que le calendrier ait bougé, annulé...) --
 * vérifié sur de vrais matchs jamais disputés : score null, statut null,
 * PDF en 404 ; impossible de distinguer un report d'une annulation, d'où la
 * règle de ne jamais demander de dépôt manuel dans ce cas. "forfait" :
 * exactement un camp marqué "FO", l'autre un score (ex. "FO" / "20"), la
 * fédération désigne alors sans ambiguïté le fautif. Tout le reste
 * (double forfait, marque inconnue...) : "ambigu", jamais deviné.
 */
export function etatDuMatch(rencontre) {
	const { scoreDomicile: d, scoreExterieur: e } = rencontre;
	if (d == null && e == null) return { etat: "non_joue" };
	if (estNombre(d) && estNombre(e)) return { etat: "joue" };
	if (d === "FO" && estNombre(e)) return { etat: "forfait", fautif: "domicile" };
	if (e === "FO" && estNombre(d)) return { etat: "forfait", fautif: "exterieur" };
	return { etat: "ambigu", raison: `score affiché « ${d ?? "?"} / ${e ?? "?"} »` };
}

/** Ordre de passage quand le nombre de requêtes par build est limité : les
 * rencontres jamais vues d'abord, puis celles dont la feuille est attendue,
 * les matchs non joués en dernier (les plus susceptibles de rester en
 * attente longtemps, ils ne doivent pas bloquer les autres). */
export function priorite(etat) {
	if (!etat) return 0;
	return { telechargee: 1, echec_lecture: 2, attente_feuille: 3, abandon: 4, forfait_ambigu: 5, attente_score: 6 }[etat.statut] ?? 7;
}
