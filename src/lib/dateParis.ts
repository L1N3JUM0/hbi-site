/**
 * Lit une date saisie depuis le CMS en tenant compte du fuseau horaire de
 * Paris quand elle n'en précise aucun.
 *
 * Selon sa configuration, Sveltia CMS peut écrire un champ date/heure soit
 * avec un fuseau explicite ("2026-10-11T18:00:00.000Z", "…+02:00"), soit "à
 * plat" ("2026-10-11T20:00"), c'est-à-dire l'heure lue sur le formulaire par
 * la personne qui saisit. Un `new Date("2026-10-11T20:00")` interprète cette
 * forme à plat dans le fuseau de la machine qui construit le site -- UTC sur
 * le runner GitHub Actions -- et décale donc l'heure affichée de 1 à 2 h.
 * Même classe de bug que celle décrite dans saison.ts : on interprète ici
 * l'heure à plat comme une heure de Paris, à coup sûr.
 *
 * Piège : dans un frontmatter, `date: 2026-10-11T14:30:00` (sans guillemets,
 * tel que Sveltia l'écrit) n'arrive jamais ici comme texte. Le YAML (js-yaml,
 * utilisé par Astro) le convertit d'abord en `Date` en le lisant comme UTC
 * -- 14:30 UTC, soit 16:30 à Paris. Un `Date` reçu est donc relu comme une
 * heure à plat (ses composantes UTC = l'heure tapée dans le CMS). Contrepartie
 * : une date écrite à la main avec un fuseau explicite (`…Z`, `+02:00`)
 * serait elle aussi relue comme heure de Paris, le YAML ne gardant pas cette
 * information ; Sveltia, tel que configuré, n'en écrit jamais.
 */

const SANS_FUSEAU = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

const PARIS = new Intl.DateTimeFormat("en-US", {
	timeZone: "Europe/Paris",
	hourCycle: "h23",
	year: "numeric",
	month: "numeric",
	day: "numeric",
	hour: "numeric",
	minute: "numeric",
	second: "numeric",
});

/** Décalage (en ms) de Paris par rapport à UTC à cet instant : +1 h l'hiver,
 * +2 h l'été. */
function decalageParis(instant: Date): number {
	const p = Object.fromEntries(PARIS.formatToParts(instant).map((part) => [part.type, part.value]));
	const heureParisVueEnUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
	return heureParisVueEnUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Renvoie l'instant correspondant, ou `undefined` si la valeur n'est pas une
 * date exploitable (le schéma la traite alors comme "non renseignée"). */
export function lireDateParis(valeur: unknown): Date | undefined {
	if (valeur instanceof Date) {
		if (Number.isNaN(valeur.getTime())) return undefined;
		return heureDeParis(
			valeur.getUTCFullYear(),
			valeur.getUTCMonth() + 1,
			valeur.getUTCDate(),
			valeur.getUTCHours(),
			valeur.getUTCMinutes(),
			valeur.getUTCSeconds(),
		);
	}
	if (typeof valeur !== "string") return undefined;

	const brut = valeur.trim();
	const plat = SANS_FUSEAU.exec(brut);
	if (!plat) {
		const date = new Date(brut);
		return Number.isNaN(date.getTime()) ? undefined : date;
	}

	const [, annee, mois, jour, heure = "0", minute = "0", seconde = "0"] = plat;
	return heureDeParis(+annee, +mois, +jour, +heure, +minute, +seconde);
}

/** L'instant où les horloges de Paris affichent cette date et cette heure. */
function heureDeParis(annee: number, mois: number, jour: number, heure: number, minute: number, seconde: number): Date {
	const heureVueEnUtc = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);
	// Deux passes : le décalage dépend de l'instant qu'on cherche, pas de
	// l'heure "à plat" -- la 2e passe corrige les heures proches d'un
	// changement d'heure été/hiver.
	const premiere = heureVueEnUtc - decalageParis(new Date(heureVueEnUtc));
	return new Date(heureVueEnUtc - decalageParis(new Date(premiere)));
}

const JOUR_PARIS = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Europe/Paris",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** Le jour calendaire d'un instant, en heure de Paris ("2026-09-26") : deux
 * instants sont "le même jour" pour le club s'ils ont la même valeur ici, même
 * si leurs dates UTC diffèrent (un match à 00h30 heure de Paris est encore la
 * veille en UTC). */
export function jourParis(date: Date): string {
	return JOUR_PARIS.format(date);
}
