export function formatArticleDate(date: Date): string {
	return new Intl.DateTimeFormat("fr-FR", {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "Europe/Paris",
	}).format(date);
}
