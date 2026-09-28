/**
 * Ré-export : la logique vit dans src/lib/fdme/saison.mjs, en JavaScript
 * simple plutôt qu'en TypeScript ici, pour que les scripts Node "purs" qui
 * tournent AVANT le build Astro (scripts/import-fdme.mjs, via
 * src/lib/fdme/parseFeuille.mjs) puissent l'utiliser sans transpilation --
 * la même fonction sert ainsi à la fois à calculer le champ `saison` d'un
 * résultat ici (voir content.config.ts) et à savoir, pendant l'import,
 * si un résultat appartient à la saison en cours (voir ce fichier pour le
 * détail).
 */
export { saisonPour, saisonActuelle } from "./fdme/saison.mjs";
