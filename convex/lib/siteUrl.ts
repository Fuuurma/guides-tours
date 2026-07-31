/** Canonical public app origin for emails, SMS, and invite deep-links.
 * Falls back to localhost for dev. In production, SITE_URL must be set
 * to an HTTPS URL — throws if unset in production. */
export function getSiteUrl(): string {
	const url = process.env.SITE_URL;
	if (!url) {
		// In production, a missing SITE_URL is a misconfiguration that
		// would produce broken links in emails/SMS and could leak
		// internal addresses. Fail loudly instead of silently defaulting.
		if (process.env.NODE_ENV === "production") {
			throw new Error(
				"SITE_URL environment variable must be set in production",
			);
		}
		return "http://127.0.0.1:3020";
	}
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
