import { createHmac } from "node:crypto";

/**
 * Empreinte à sens unique d'un numéro de licence FFHandball : HMAC-SHA256
 * avec un pépin secret (`LICENCE_HASH_PEPPER`, jamais commité -- voir
 * .env.local en local, secret "LICENCE_HASH_PEPPER" des GitHub Actions du
 * dépôt en CI). Sert de clé stable pour relier les apparitions d'un·e même
 * joueur·se d'une feuille de match à l'autre, y compris d'une saison ou
 * d'une catégorie à l'autre (cumul de carrière, voir
 * src/lib/carriereJoueur.ts) -- SANS jamais stocker ni afficher le numéro de
 * licence lui-même (voir statJoueurMatch dans content.config.ts).
 *
 * Un numéro de licence (9 à 15 chiffres, voir parsePlayerTable() dans
 * parseFeuille.mjs) est trop peu entropique pour qu'un simple hash, non
 * pépiné, offre une vraie garantie d'irréversibilité : sans le pépin secret,
 * il resterait envisageable de le retrouver par force brute (essayer toutes
 * les valeurs possibles). Avec le pépin, cette attaque est infaisable sans
 * lui.
 */
export function hashLicence(licence) {
	const pepper = process.env.LICENCE_HASH_PEPPER;
	if (!pepper) {
		throw new Error(
			"LICENCE_HASH_PEPPER absent de l'environnement : requis pour hacher les numéros de licence (voir .env.local en local, secret GitHub Actions en CI). Sans lui, le hash ne serait pas une garantie fiable d'irréversibilité.",
		);
	}
	return createHmac("sha256", pepper).update(licence).digest("hex");
}
