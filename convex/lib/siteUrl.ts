/** Canonical public app origin for emails, SMS, and invite deep-links.
 * Falls back to localhost for dev. In production, SITE_URL must be set
 * to an HTTPS URL — throws if unset in production. */
import { logger } from "./logger";

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
		logger.warn(
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

/** True when the Convex deployment carries no real site URL — local dev,
 * unit tests, and push-time codegen. A SET, non-local CONVEX_SITE_URL
 * means a configured deployment: misconfigurations there must fail
 * closed or log loudly, never silently degrade. One shared idiom for
 * auth.ts (SITE_URL fallback signal) and http.ts (trustedOrigins split).
 * Reads CONVEX_SITE_URL, NOT NODE_ENV (unreliable inside the Convex
 * runtime — SITE_URL-fallback policy decision, fleet 2026-09-13). */
export function isUnconfiguredDeployment(): boolean {
	const siteUrl = process.env.CONVEX_SITE_URL?.trim() ?? "";
	return (
		siteUrl === "" ||
		siteUrl.includes("127.0.0.1") ||
		siteUrl.includes("localhost")
	);
}

/** trustedOrigins for auth route registration (SITE_URL policy, fleet
 * 2026-09-13): SITE_URL is the canonical origin; on a configured
 * deployment with SITE_URL unset, no localhost anchor is synthesized
 * (no localhost trust in prod). CONVEX_SITE_URL is always included
 * when present. */
export function trustedOriginsForDeployment(): string[] {
	return [
		isUnconfiguredDeployment()
			? (process.env.SITE_URL ?? "http://127.0.0.1:3020")
			: process.env.SITE_URL,
		process.env.CONVEX_SITE_URL,
	].filter((origin): origin is string => typeof origin === "string");
}
