export interface AgendaTeamConfig {
	/** Nom affiché sur le site (page /equipes, page /agenda). */
	nomAffiche: string;
	/** Identifiant partagé avec le champ `slug` d'une entrée de la collection
	 * de contenu src/content/equipes/ -- c'est ce qui relie de façon fiable
	 * une équipe à son flux de calendrier (aucune correspondance sur le nom).
	 * Plusieurs entrées d'agendaTeams peuvent pointer vers le même
	 * equipeSlug (ex: Seniors masculins 1 et 2 partagent "seniors-masculins"). */
	equipeSlug: string;
	/** Flux iCal officiel FFHandball de la compétition (peut être partagé par
	 * plusieurs équipes du club engagées dans la même poule). */
	urlIcs: string;
	/** Texte tel qu'il apparaît dans les résumés d'événements du flux pour
	 * repérer CETTE équipe précisément (ex: "Handball Islois 1" pour ne pas
	 * la confondre avec "Handball Islois 2"). Comparaison insensible à la casse. */
	matchLabel: string;
	/** Lien vers le classement de la compétition. Laisser vide pour le
	 * déduire automatiquement de l'URL des rencontres du flux ; renseigner
	 * uniquement si la déduction automatique ne fonctionne pas pour ce flux. */
	urlClassement?: string;
}

/**
 * Pour ajouter une nouvelle équipe : une ligne ici suffit, avec son flux
 * iCal officiel FFHandball. Voir le README pour la procédure complète.
 */
export const agendaTeams: AgendaTeamConfig[] = [
	{
		nomAffiche: "Seniors féminines",
		equipeSlug: "seniors-feminines",
		urlIcs: "https://competition-calendar.ffhandball.fr/c-32648/s-3577.ics",
		matchLabel: "Handball Islois",
	},
	{
		nomAffiche: "Seniors masculins 1",
		equipeSlug: "seniors-masculins",
		urlIcs: "https://competition-calendar.ffhandball.fr/c-32649/s-3577.ics",
		matchLabel: "Handball Islois 1",
	},
	{
		nomAffiche: "Seniors masculins 2",
		equipeSlug: "seniors-masculins",
		urlIcs: "https://competition-calendar.ffhandball.fr/c-32649/s-3577.ics",
		matchLabel: "Handball Islois 2",
	},
];
