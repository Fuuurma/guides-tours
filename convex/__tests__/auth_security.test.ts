// Security-focused tests for the Better Auth configuration.
//
// Coverage:
//   - requireEmailVerification is true (not false) in the auth config
//   - requireEmailVerificationOnInvitation is true in the organization plugin
//   - sendVerificationEmail callback is defined
//   - minPasswordLength is at least 8
//   - isGoogleEnabled query returns a boolean
//   - getCurrentUser returns null when not authenticated

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { createAuthOptions } from "../auth";

const modules = import.meta.glob("../**/*.{ts,tsx}");

describe("auth security configuration", () => {
	// createAuthOptions captures ctx in a closure (for the DB adapter) but
	// does not invoke it at construction time, so a bare mock ctx is safe
	// for inspecting the static security settings.
	const options = createAuthOptions({} as any);

	it("requireEmailVerification is true (not false)", () => {
		expect(options.emailAndPassword?.enabled).toBe(true);
		expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
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
