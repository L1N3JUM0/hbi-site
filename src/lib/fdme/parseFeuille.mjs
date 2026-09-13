import { extractRows, rowText, nearestItem } from "./pdfRows.mjs";
import { stripBirthName, splitNomPrenom } from "./noms.mjs";
import { detectEquipe, CLUB_CODE, CLUB_NAME_PATTERN } from "./equipeMatch.mjs";

/** Erreur levée quand une feuille ne correspond pas au format attendu --
 * l'appelant (scripts/import-fdme.mjs) l'attrape pour ignorer ce PDF avec un
 * avertissement clair, sans faire échouer le build. */
export class FeuilleFormatError extends Error {}

const STAT_COLUMNS = ["buts", "sept_m", "tirs", "arrets", "avertissements", "exclusions", "disqualification"];
const STAT_HEADER_LABELS = { buts: "Buts", sept_m: "7m", tirs: "Tirs", arrets: "Arrets", avertissements: "Av.", exclusions: "2'", disqualification: "Dis" };
/** Une valeur ne peut être rattachée à une colonne de stats que si elle est
 * à moins de cette distance (points PDF) de l'en-tête de cette colonne --
 * évite qu'un numéro de licence ou la lettre "Type Lic" (bien plus loin à
 * gauche) ne soit pris à tort pour une statistique sur une ligne creuse. */
const STAT_COLUMN_MAX_DISTANCE = 10;

function findRow(rows, predicate, fromIndex = 0) {
	for (let i = fromIndex; i < rows.length; i++) {
		if (predicate(rows[i])) return { row: rows[i], index: i };
	}
	return null;
}

function parseHeaderFields(rows) {
	const text = rows.map(rowText).join("\n");

	// Deux gabarits observés selon la compétition ("DATE:"/"SALLE:" en
	// majuscules avec "Journée / Date", ou "Date"/"Salle" sans majuscules ni
	// ":" et "Journée" seule) -- l'un et l'autre sont acceptés partout.
	const code = /Code Renc\s+(\S+)/.exec(text)?.[1];
	const competition = /Compétition\s+(.+?)\s+Groupe/.exec(text)?.[1]?.trim();
	const journee = /Journ[ée]e\s*(?:\/\s*Date)?\s+(J\d+)/i.exec(text)?.[1];

	const dateMatch = /Date\s*:?\s+\S+\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i.exec(text);
	let date = null;
	if (dateMatch) {
		const [, jj, mm, aaaa, hh, min] = dateMatch;
		date = new Date(Number(aaaa), Number(mm) - 1, Number(jj), Number(hh), Number(min));
	}

	const salleRow = findRow(rows, (r) => /salle\s*:?/i.test(rowText(r)));
	const salle = salleRow ? /salle\s*:?\s+(.+)$/i.exec(rowText(salleRow.row))?.[1]?.trim() : undefined;

	const teamsRow = findRow(
		rows,
		(r) => {
			const t = rowText(r);
			return !/Organisateur|Compétition|Groupe/.test(t) && /^.+\/.+\d+\s+\d+$/.test(t);
		},
	);
	const teamsMatch = teamsRow ? /^(.+?)\s*\/\s*(.+?)\s+(\d+)\s+(\d+)$/.exec(rowText(teamsRow.row)) : null;

	const detailRow = findRow(rows, (r) => rowText(r).includes("DETAIL") && rowText(r).includes("SCORE"));
	const detailNumbers = detailRow ? [...rowText(detailRow.row).matchAll(/\d+/g)].map((m) => Number(m[0])) : [];
	// Les nombres de "Code Renc"/"Groupe" ne sont pas sur cette ligne : ce
	// sont uniquement les scores par période, en paires (domicile, extérieur).
	const scoreMiTemps = detailNumbers.length >= 2 ? { domicile: detailNumbers[0], exterieur: detailNumbers[1] } : null;
	const scoreFinalDetail =
		detailNumbers.length >= 4 ? { domicile: detailNumbers.at(-2), exterieur: detailNumbers.at(-1) } : null;

	if (!code || !competition || !date || !teamsMatch) {
		throw new FeuilleFormatError(
			`En-tête de feuille de match non reconnu (code=${code}, competition=${competition}, date=${date}, equipes=${teamsMatch ? "ok" : "absent"}).`,
		);
	}

	const [, equipeDomicile, equipeExterieur, scoreDomicileHeader, scoreExterieurHeader] = teamsMatch;
	const scoreFinal = scoreFinalDetail ?? { domicile: Number(scoreDomicileHeader), exterieur: Number(scoreExterieurHeader) };

	return {
		codeRencontre: code,
		competition,
		journee,
		date,
		salle,
		equipeDomicile: equipeDomicile.trim(),
		equipeExterieur: equipeExterieur.trim(),
		scoreDomicile: scoreFinal.domicile,
		scoreExterieur: scoreFinal.exterieur,
		scoreMiTempsDomicile: scoreMiTemps?.domicile,
		scoreMiTempsExterieur: scoreMiTemps?.exterieur,
	};
}

/** x des colonnes de stats sur CETTE feuille, déduits de sa propre ligne
 * d'en-tête ("Capt N° NOM prénom (Nom d'usage) Licence Type Lic Buts 7m
 * Tirs Arrets Av. 2' Dis") -- une extraction par expression régulière
 * classique échoue sur ce tableau (colonnes trop resserrées en fin de
 * ligne) ; il faut passer par les coordonnées x et rattacher chaque valeur
 * à la colonne d'en-tête la plus proche. La colonne "Type Lic" (parfois
 * "Type JFL" selon la compétition) n'est volontairement pas recherchée ici
 * : elle n'est jamais exploitée par le parseur, l'exiger ne ferait
 * qu'ajouter une façon de plus pour une feuille valide d'être rejetée. */
function headerColumnPositions(headerRow) {
	const find = (str) => headerRow.items.find((i) => i.str === str)?.x;
	const positions = {
		licence: find("Licence"),
		buts: find("Buts"),
		sept_m: find("7m"),
		tirs: find("Tirs"),
		arrets: find("Arrets"),
		avertissements: find("Av."),
		exclusions: find("2'"),
		disqualification: find("Dis"),
	};
	for (const [key, x] of Object.entries(positions)) {
		if (x === undefined) throw new FeuilleFormatError(`Colonne "${STAT_HEADER_LABELS[key] ?? key}" introuvable dans l'en-tête du tableau de stats.`);
	}
	return positions;
}

/** Extrait la liste des joueur·se·s d'une équipe à partir de la ligne
 * d'en-tête "Capt N° ... Dis" de son tableau, jusqu'à la ligne d'en-tête
 * suivante (autre équipe) ou la fin des lignes fournies. */
function parsePlayerTable(rows, headerIndex, stopIndex) {
	const headerRow = rows[headerIndex];
	const cols = headerColumnPositions(headerRow);
	const players = [];

	for (let i = headerIndex + 1; i < stopIndex; i++) {
		const row = rows[i];
		const licenceItem = row.items.find((it) => it.x > cols.licence - 15 && it.x < cols.licence + 15 && /^\d{9,15}$/.test(it.str));
		if (!licenceItem) continue; // ligne décorative (nom d'équipe, "Kiné", "Médecin"...), pas une personne.

		// Numéro de maillot : item purement numérique (1-3 chiffres) avant la
		// licence -- présent aussi bien pour un·e joueur·se que pour la
		// capitaine ("X" en plus à gauche), absent pour le staff ("Officiel
		// Resp", "Officiel B"...).
		const jerseyItem = row.items.find((it) => it.x < cols.licence && /^\d{1,3}$/.test(it.str));
		if (!jerseyItem) continue; // ligne de staff (officiel, kiné, médecin...).

		const nameItems = row.items.filter((it) => it.x > jerseyItem.x && it.x < cols.licence - 20);
		const rawName = stripBirthName(nameItems.map((it) => it.str).join(" "));
		const parsed = splitNomPrenom(rawName);
		if (!parsed) continue; // format de nom inattendu : on ignore la ligne plutôt que de deviner.

		const stats = {};
		for (const key of STAT_COLUMNS) {
			const item = nearestItem(row, cols[key], STAT_COLUMN_MAX_DISTANCE);
			// "Av." (avertissement) et "Dis" (disqualification) sont des
			// indicateurs oui/non sur la feuille (une croix "X", pas un
			// nombre) -- une croix vaut 1, un nombre absent vaut 0.
			stats[key] = !item ? 0 : /^x$/i.test(item.str) ? 1 : Number(item.str) || 0;
		}

		players.push({
			numero: Number(jerseyItem.str),
			nom: parsed.nom,
			prenom: parsed.prenom,
			buts: stats.buts,
			sept_m: stats.sept_m,
			tirs: stats.tirs,
			arrets: stats.arrets,
			avertissements: stats.avertissements,
			exclusions: stats.exclusions,
			disqualification: stats.disqualification > 0,
		});
	}

	return players;
}

function sommeEquipe(players) {
	return {
		buts: players.reduce((s, p) => s + p.buts, 0),
		tirs: players.reduce((s, p) => s + p.tirs, 0),
		arrets: players.reduce((s, p) => s + p.arrets, 0),
		exclusions: players.reduce((s, p) => s + p.exclusions, 0),
		avertissements: players.reduce((s, p) => s + p.avertissements, 0),
	};
}

const EVENT_TIME_PATTERN = /^\d{2}:\d{2}$/;
const EVENT_SCORE_PATTERN = /^(\d+)\s*-\s*(\d+)$/;

function classifyEvenement(actionText) {
	if (/^But\b/i.test(actionText)) return "but";
	if (/^2MN\b/i.test(actionText)) return "exclusion";
	if (/^Avertissement\b/i.test(actionText)) return "avertissement";
	if (/^(Disqualification|Exclusion d[ée]finitive)\b/i.test(actionText)) return "disqualification";
	if (/^Arr[êe]t\b/i.test(actionText)) return "arret";
	if (/^Tir\b/i.test(actionText)) return "tir_manque";
	return "autre";
}

function tempsEnSecondes(temps) {
	const [mm, ss] = temps.split(":").map(Number);
	return mm * 60 + ss;
}

/** Regroupe des positions x en clusters (deux colonnes attendues) : une
 * valeur rejoint le dernier cluster si elle en est à moins de `gap` points,
 * sinon elle démarre un nouveau cluster. Renvoie la moyenne de chaque
 * cluster, triée par x croissant. */
function clusterX(values, gap = 20) {
	const sorted = [...values].sort((a, b) => a - b);
	const clusters = [];
	for (const v of sorted) {
		const current = clusters.at(-1);
		if (current && v - current.at(-1) <= gap) current.push(v);
		else clusters.push([v]);
	}
	return clusters.map((c) => c.reduce((s, v) => s + v, 0) / c.length);
}

/**
 * La chronologie est répartie sur deux colonnes visuelles (PERIODE 1 à
 * gauche, PERIODE 2 à droite) qui partagent la même numérotation de temps
 * cumulée (la PERIODE 2 ne repart pas à 00:00) : on les extrait
 * indépendamment puis on trie par temps, plutôt que de supposer un ordre de
 * lecture ligne par ligne qui alternerait incorrectement les deux périodes.
 *
 * Les en-têtes "Temps"/"Score" des deux colonnes n'atterrissent pas
 * toujours sur la même ligne visuelle (constaté sur une feuille réelle où
 * la colonne de droite est décalée de ~20pt par rapport à la gauche) : on
 * les cherche donc sur TOUTES les lignes à partir de "Déroulé du Match",
 * pas sur une seule ligne d'en-tête supposée les porter toutes les six.
 *
 * La borne gauche de la zone "Action" n'est PAS déduite du x de l'en-tête
 * "Action" : sur une feuille réelle, ce libellé est affiché bien plus à
 * droite (~468pt) que là où le texte de l'action démarre réellement
 * (~383pt, juste après la colonne Score) -- l'en-tête n'est pas aligné sur
 * le début de sa colonne de données. On part donc du x de "Score" + une
 * marge constante, calibrée sur plusieurs feuilles réelles (le texte du
 * score, format "37 - 41", ne dépasse jamais cette largeur).
 */
const ACTION_OFFSET_FROM_SCORE = 35;

function parseChronologie(rows, dérouleIndex) {
	const tempsX = [];
	const scoreX = [];
	for (let i = dérouleIndex; i < rows.length; i++) {
		for (const item of rows[i].items) {
			if (item.str === "Temps") tempsX.push(item.x);
			else if (item.str === "Score") scoreX.push(item.x);
		}
	}
	const [tempsGauche, tempsDroite] = clusterX(tempsX);
	const [scoreGauche, scoreDroite] = clusterX(scoreX);
	if (tempsDroite === undefined || scoreDroite === undefined) {
		throw new FeuilleFormatError("En-tête de la chronologie du match ('Déroulé du Match') non reconnu.");
	}
	const slots = [
		{ tempsX: tempsGauche, scoreX: scoreGauche, actionXMin: scoreGauche + ACTION_OFFSET_FROM_SCORE, actionXMax: tempsDroite },
		{ tempsX: tempsDroite, scoreX: scoreDroite, actionXMin: scoreDroite + ACTION_OFFSET_FROM_SCORE, actionXMax: Infinity },
	];

	const events = [];
	for (let i = dérouleIndex; i < rows.length; i++) {
		const row = rows[i];
		for (const slot of slots) {
			const tempsItem = nearestItem(row, slot.tempsX, 8);
			const scoreItem = nearestItem(row, slot.scoreX, 15);
			if (!tempsItem || !EVENT_TIME_PATTERN.test(tempsItem.str)) continue;
			if (!scoreItem) continue;
			const scoreMatch = EVENT_SCORE_PATTERN.exec(scoreItem.str);
			if (!scoreMatch) continue;
			const actionText = row.items
				.filter((it) => it.x >= slot.actionXMin - 5 && it.x < slot.actionXMax - 5)
				.map((it) => it.str)
				.join(" ")
				.trim();
			events.push({
				temps: tempsItem.str,
				scoreDomicile: Number(scoreMatch[1]),
				scoreExterieur: Number(scoreMatch[2]),
				type: classifyEvenement(actionText),
			});
		}
	}

	events.sort((a, b) => tempsEnSecondes(a.temps) - tempsEnSecondes(b.temps));

	return events;
}

/** Ajoute des points de repère mi-temps/fin de match recalés sur le score
 * officiel (bloc "Détail score"), pour que le graphique se termine toujours
 * exactement sur le bon score même si de rares événements de fin de
 * période sans horodatage exploitable ont été ignorés. */
function ajouterRepetesChronologie(events, header) {
	const withBoundaries = [...events];
	const last = (arr) => arr.at(-1);

	if (header.scoreMiTempsDomicile != null) {
		const periode1 = events.filter((e) => e.scoreDomicile + e.scoreExterieur <= header.scoreMiTempsDomicile + header.scoreMiTempsExterieur);
		const derniersPeriode1 = last(periode1);
		const dejaExact =
			derniersPeriode1 && derniersPeriode1.scoreDomicile === header.scoreMiTempsDomicile && derniersPeriode1.scoreExterieur === header.scoreMiTempsExterieur;
		if (!dejaExact) {
			withBoundaries.push({
				temps: derniersPeriode1?.temps ?? "--:--",
				scoreDomicile: header.scoreMiTempsDomicile,
				scoreExterieur: header.scoreMiTempsExterieur,
				type: "mi_temps",
			});
		}
	}

	const dernierEvenement = last(events);
	const finDejaExacte = dernierEvenement && dernierEvenement.scoreDomicile === header.scoreDomicile && dernierEvenement.scoreExterieur === header.scoreExterieur;
	if (!finDejaExacte) {
		withBoundaries.push({
			temps: dernierEvenement?.temps ?? "--:--",
			scoreDomicile: header.scoreDomicile,
			scoreExterieur: header.scoreExterieur,
			type: "fin_match",
		});
	}

	withBoundaries.sort((a, b) => tempsEnSecondes(a.temps === "--:--" ? "00:00" : a.temps) - tempsEnSecondes(b.temps === "--:--" ? "00:00" : b.temps));
	return withBoundaries;
}

/**
 * Analyse une feuille de match FDME (PDF FFHandball) et renvoie les données
 * prêtes à écrire dans une entrée de la collection "resultats".
 *
 * @param {Uint8Array} pdfBytes
 * @returns {Promise<object>} voir la forme détaillée dans scripts/import-fdme.mjs
 * @throws {FeuilleFormatError} si le PDF n'a pas le format attendu.
 */
export async function parseFeuilleDeMatch(pdfBytes) {
	const rows = await extractRows(pdfBytes);
	const header = parseHeaderFields(rows);

	const domicileEstHBI = CLUB_NAME_PATTERN.test(header.equipeDomicile);
	const exterieurEstHBI = CLUB_NAME_PATTERN.test(header.equipeExterieur);
	if (!domicileEstHBI && !exterieurEstHBI) {
		throw new FeuilleFormatError(`Aucune des deux équipes ("${header.equipeDomicile}" / "${header.equipeExterieur}") ne semble être le HBI.`);
	}

	const headerRows = rows
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => row.items.some((i) => i.str === "Capt") && rowText(row).includes("Buts"));
	if (headerRows.length !== 2) {
		throw new FeuilleFormatError(`${headerRows.length} tableau(x) de stats joueur·se·s trouvé(s), 2 attendus.`);
	}
	const [premiereEquipe, deuxiemeEquipe] = headerRows;

	const deroule = findRow(rows, (r) => rowText(r).includes("Déroulé du Match"));

	const joueursDomicile = parsePlayerTable(rows, premiereEquipe.index, deuxiemeEquipe.index);
	const joueursExterieur = parsePlayerTable(rows, deuxiemeEquipe.index, deroule?.index ?? rows.length);

	// Vérification de cohérence (avertissement seulement, ne bloque jamais
	// l'import) : le total des buts marqués par les joueur·se·s d'un camp doit
	// correspondre au score final de ce camp -- validé sur des feuilles
	// réelles lors du prototypage de cet import.
	const avertissements = [];
	const sommeButsDomicile = joueursDomicile.reduce((s, p) => s + p.buts, 0);
	const sommeButsExterieur = joueursExterieur.reduce((s, p) => s + p.buts, 0);
	if (sommeButsDomicile !== header.scoreDomicile) {
		avertissements.push(`Somme des buts domicile (${sommeButsDomicile}) ≠ score final (${header.scoreDomicile}).`);
	}
	if (sommeButsExterieur !== header.scoreExterieur) {
		avertissements.push(`Somme des buts extérieur (${sommeButsExterieur}) ≠ score final (${header.scoreExterieur}).`);
	}

	let chronologie = deroule ? parseChronologie(rows, deroule.index) : [];
	if (chronologie.length > 0) chronologie = ajouterRepetesChronologie(chronologie, header);

	const { equipeSlug, typeMatch } = detectEquipe(header.competition);

	const domicile = domicileEstHBI;
	const joueursHBI = domicile ? joueursDomicile : joueursExterieur;
	const adversaire = domicile ? header.equipeExterieur : header.equipeDomicile;

	return {
		codeRencontre: header.codeRencontre,
		equipeSlug,
		date: header.date,
		journee: header.journee,
		competition: header.competition,
		typeMatch,
		domicile,
		adversaire,
		salle: header.salle,
		scoreDomicile: header.scoreDomicile,
		scoreExterieur: header.scoreExterieur,
		scoreMiTempsDomicile: header.scoreMiTempsDomicile,
		scoreMiTempsExterieur: header.scoreMiTempsExterieur,
		chronologie,
		statsEquipeDomicile: sommeEquipe(joueursDomicile),
		statsEquipeExterieur: sommeEquipe(joueursExterieur),
		statsJoueurs: joueursHBI,
		avertissements,
	};
}
