/** Canonical public app origin for emails, SMS, and invite deep-links. */
export function getSiteUrl(): string {
	return process.env.SITE_URL ?? "http://127.0.0.1:3020";
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
