/** Canonical public app origin for emails, SMS, and invite deep-links.
 * Falls back to localhost for dev. In production, SITE_URL must be set
 * to an HTTPS URL — a warning is logged if it's HTTP or unset. */
export function getSiteUrl(): string {
	const url = process.env.SITE_URL ?? "http://127.0.0.1:3020";
	if (url.startsWith("http://") && !url.includes("127.0.0.1") && !url.includes("localhost")) {
		console.warn(
			`[siteUrl] SITE_URL is HTTP (${url}). Set it to an HTTPS URL in production.`,
		);
	}
	return url;
}

/** Absolute dashboard URL (no trailing slash on base). */
export function dashboardUrl(path: string, query?: Record<string, string>): string {
	const base = getSiteUrl().replace(/\/$/, "");
	const normalized = path.startsWith("/") ? path : `/${path}`;
	const url = new URL(`${base}${normalized}`);
	if (query) {
		for (const [k, v] of Object.entries(query)) {
			if (v) url.searchParams.set(k, v);
		}
	}
	return url.toString();
}
