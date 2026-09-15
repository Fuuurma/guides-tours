// Security-focused tests for the Better Auth configuration.
//
// Coverage:
//   - requireEmailVerification is true in production (not false)
//   - requireEmailVerificationOnInvitation is true in the organization plugin
//   - sendVerificationEmail callback is defined
//   - minPasswordLength is at least 8
//   - isGoogleEnabled query returns a boolean
//   - getCurrentUser returns null when not authenticated
//
// Note: requireEmailVerification is env-aware — true when SITE_URL is a
// deployed domain, false when it's a localhost/127.0.0.1 dev URL (mirrors
// restaurant-calendar). These tests set SITE_URL to a production-looking
// URL to pin the secure default.

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { createAuthOptions } from "../auth";
import {
	isUnconfiguredDeployment,
	trustedOriginsForDeployment,
} from "../lib/siteUrl";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("auth security configuration", () => {
	// createAuthOptions captures ctx in a closure (for the DB adapter) but
	// does not invoke it at construction time, so a bare mock ctx is safe
	// for inspecting the static security settings.
	const options = createAuthOptions({} as any);

	it("requireEmailVerification is true in production", () => {
		process.env.SITE_URL = "https://guides-tours.fuurma.tech";
		const prodOptions = createAuthOptions({} as any);
		expect(prodOptions.emailAndPassword?.enabled).toBe(true);
		expect(prodOptions.emailAndPassword?.requireEmailVerification).toBe(true);
	});

	it("missing SITE_URL does not disable email verification", () => {
		delete process.env.SITE_URL;
		const optionsWithoutSiteUrl = createAuthOptions({} as any);
		expect(
			optionsWithoutSiteUrl.emailAndPassword?.requireEmailVerification,
		).toBe(true);
	});

	it("requireEmailVerification is false in local dev (unblocks onboarding)", () => {
		process.env.SITE_URL = "http://127.0.0.1:3020";
		const devOptions = createAuthOptions({} as any);
		expect(devOptions.emailAndPassword?.requireEmailVerification).toBe(false);
	});

	it("requireEmailVerificationOnInvitation is true in the organization plugin", () => {
		// The organization plugin is the first plugin in the tuple.
		const orgPlugin = options.plugins?.[0] as {
			options?: { requireEmailVerificationOnInvitation?: boolean };
		};
		expect(orgPlugin?.options?.requireEmailVerificationOnInvitation).toBe(
			true,
		);
	});

	it("sendVerificationEmail callback is defined", () => {
		expect(options.emailVerification?.sendVerificationEmail).toBeDefined();
		expect(typeof options.emailVerification?.sendVerificationEmail).toBe(
			"function",
		);
	});

	it("minPasswordLength is at least 8", () => {
		expect(options.emailAndPassword?.minPasswordLength).toBeGreaterThanOrEqual(
			8,
		);
	});
});

describe("auth queries", () => {
	it("isGoogleEnabled returns a boolean", async () => {
		delete process.env.GOOGLE_CLIENT_ID;
		delete process.env.GOOGLE_CLIENT_SECRET;
		const t = convexTest(schema, modules);

		const result = await t.query(api.auth.isGoogleEnabled, {});
		expect(typeof result).toBe("boolean");
	});

	it("isGoogleEnabled returns true when both env vars are set", async () => {
		process.env.GOOGLE_CLIENT_ID = "test-id.apps.googleusercontent.com";
		process.env.GOOGLE_CLIENT_SECRET = "test-secret";
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.isGoogleEnabled, {})).resolves.toBe(true);
	});

	it("getCurrentUser returns null when not authenticated", async () => {
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.getCurrentUser, {})).resolves.toBeNull();
	});
});

// SITE_URL-fallback policy (fleet 2026-09-13, option b): the shared
// configured/unconfigured predicate reads CONVEX_SITE_URL — never
// NODE_ENV — and gates both the auth.ts degrade signal and http.ts's
// localhost trust anchor.
describe("isUnconfiguredDeployment", () => {
	it("treats unset CONVEX_SITE_URL as unconfigured (dev/tests/codegen)", () => {
		delete process.env.CONVEX_SITE_URL;
		expect(isUnconfiguredDeployment()).toBe(true);
	});

	it("treats local CONVEX_SITE_URL as unconfigured", () => {
		process.env.CONVEX_SITE_URL = "http://127.0.0.1:3020";
		expect(isUnconfiguredDeployment()).toBe(true);
	});

	it("treats a non-local CONVEX_SITE_URL as configured", () => {
		process.env.CONVEX_SITE_URL = "https://guides-tours.fuurma.tech";
		expect(isUnconfiguredDeployment()).toBe(false);
	});
});

describe("trustedOriginsForDeployment (SITE_URL policy)", () => {
	function withEnv(env: Record<string, string | undefined>, fn: () => void) {
		const saved = { ...process.env };
		try {
			delete process.env.CONVEX_SITE_URL;
			delete process.env.SITE_URL;
			for (const [k, v] of Object.entries(env)) {
				if (v !== undefined) process.env[k] = v;
			}
			fn();
		} finally {
			process.env = saved;
		}
	}

	it("configured deployment + missing SITE_URL trusts NO localhost anchor", () => {
		withEnv(
			{
				CONVEX_SITE_URL: "https://guides-tours.fuurma.tech",
			},
			() => {
				const origins = trustedOriginsForDeployment();
				expect(origins).not.toContain("http://127.0.0.1:3020");
				expect(origins).toContain("https://guides-tours.fuurma.tech");
			},
		);
	});

	it("unconfigured deployment keeps the localhost fallback", () => {
		withEnv({}, () => {
			expect(trustedOriginsForDeployment()).toContain(
				"http://127.0.0.1:3020",
			);
		});
	});

	it("configured deployment + SITE_URL set trusts SITE_URL only", () => {
		withEnv(
			{
				CONVEX_SITE_URL: "https://guides-tours.fuurma.tech",
				SITE_URL: "https://guides-tours.fuurma.tech",
			},
			() => {
				const origins = trustedOriginsForDeployment();
				// CONVEX_SITE_URL membership is unchanged by the policy —
				// both entries carry the deployed origin here.
				expect(origins).toContain("https://guides-tours.fuurma.tech");
				expect(origins).not.toContain("http://127.0.0.1:3020");
			},
		);
	});
});

// getSiteUrl degraded-not-dead policy (fleet decision 7a7d0b9a, option b):
// never throws; unconfigured deployments get a silent localhost fallback,
// configured deployments get the same fallback PLUS a once-per-isolate
// logger.error so a missing SITE_URL can't silently ship broken links.
// The once-flag is module state, so each case re-imports a fresh module.
describe("getSiteUrl fallback policy", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	async function freshGetSiteUrl() {
		vi.resetModules();
		const mod = await import("../lib/siteUrl");
		return mod.getSiteUrl;
	}

	it("configured deployment + missing SITE_URL: degrades to localhost and logs loudly once", async () => {
		vi.stubEnv("CONVEX_SITE_URL", "https://guides-tours.fuurma.tech");
		vi.stubEnv("SITE_URL", "");
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const getSiteUrl = await freshGetSiteUrl();

		expect(getSiteUrl()).toBe("http://127.0.0.1:3020");
		expect(errorSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy.mock.calls[0]?.[0]).toContain("SITE_URL");

		// Second call: same fallback, no repeated error (once per isolate).
		errorSpy.mockClear();
		expect(getSiteUrl()).toBe("http://127.0.0.1:3020");
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("unconfigured deployment + missing SITE_URL: silent localhost fallback", async () => {
		vi.stubEnv("CONVEX_SITE_URL", "");
		vi.stubEnv("SITE_URL", "");
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const getSiteUrl = await freshGetSiteUrl();

		expect(getSiteUrl()).toBe("http://127.0.0.1:3020");
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("SITE_URL set: returns it unchanged and never logs", async () => {
		vi.stubEnv("CONVEX_SITE_URL", "https://guides-tours.fuurma.tech");
		vi.stubEnv("SITE_URL", "https://guides-tours.fuurma.tech");
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const getSiteUrl = await freshGetSiteUrl();

		expect(getSiteUrl()).toBe("https://guides-tours.fuurma.tech");
		expect(errorSpy).not.toHaveBeenCalled();
	});
});
