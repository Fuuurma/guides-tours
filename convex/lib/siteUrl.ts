/** Canonical public app origin for emails, SMS, and invite deep-links.
 * Falls back to localhost for dev. On a configured deployment (see
 * isUnconfiguredDeployment) a missing SITE_URL is a loud
 * misconfiguration — the link degrades to localhost but a
 * once-per-isolate logger.error fires so ops sees it.
 * (SITE_URL-fallback policy, fleet decision 7a7d0b9a option b —
 * degraded-not-dead: never throw, a module-scope throw takes down
 * every HTTP route and can break `convex push` codegen.) */
import { logger } from "./logger";

// Warn once per isolate, not per call — reminder/digest jobs call this
// per org row and would spam logs otherwise (F93).
let warnedMissingSiteUrl = false;

export function getSiteUrl(): string {
	const url = process.env.SITE_URL;
	if (!url) {
		if (!isUnconfiguredDeployment() && !warnedMissingSiteUrl) {
			warnedMissingSiteUrl = true;
			logger.error(
				"[siteUrl] SITE_URL is not set on a configured deployment — " +
					"auth baseURL and email links are degraded to " +
					"http://127.0.0.1:3020. Set SITE_URL on the Convex dashboard.",
			);
		}
		if (isUnconfiguredDeployment() && !warnedMissingSiteUrl) {
			warnedMissingSiteUrl = true;
			logger.warn(
				"[siteUrl] SITE_URL unset — falling back to " +
					"http://127.0.0.1:3020 (dev only; configured deployments " +
					"degrade with a loud error)",
			);
		}
		return "http://127.0.0.1:3020";
	}
	if (url.startsWith("http://") && !isLoopbackSiteUrl(url)) {
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
	return siteUrl === "" || isLoopbackSiteUrl(siteUrl);
}

/** True when the value parses as a URL whose hostname is exactly a
 * loopback host (localhost or 127.0.0.1). Substring matching is wrong
 * here: "https://tours-localhost.example.com" contains "localhost" but
 * is a production host — it must keep email verification and fail the
 * public-booking origin gate closed. Unparsable values return false
 * (fail closed), never local. */
export function isLoopbackSiteUrl(value: string): boolean {
	try {
		const hostname = new URL(value.trim()).hostname;
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
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
