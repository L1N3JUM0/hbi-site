/**
 * Prefixes an internal path with the configured Astro `base` (see
 * astro.config.mjs), so links keep working once deployed under a
 * sub-path (GitHub Pages: /hbi-site/) as well as in local dev.
 * Never use this for external URLs (Instagram, Facebook, HelloAsso...).
 */
export function withBase(path: string): string {
	const base = import.meta.env.BASE_URL;
	const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
	const cleanPath = path.startsWith("/") ? path : `/${path}`;
	return `${cleanBase}${cleanPath}`;
}
