import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");
const ORIGINAL_ENV = { ...process.env };

describe("auth OAuth env gates", () => {
	afterEach(() => {
		process.env = { ...ORIGINAL_ENV };
	});

	test("isGoogleEnabled returns false when no Google env vars are set", async () => {
		delete process.env.GOOGLE_CLIENT_ID;
		delete process.env.GOOGLE_CLIENT_SECRET;
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.isGoogleEnabled, {})).resolves.toBe(false);
	});

	test("isGoogleEnabled returns false when only one Google env var is set", async () => {
		process.env.GOOGLE_CLIENT_ID = "test-id.apps.googleusercontent.com";
		delete process.env.GOOGLE_CLIENT_SECRET;
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.isGoogleEnabled, {})).resolves.toBe(false);
	});

	test("isGoogleEnabled returns false for empty Google env vars", async () => {
		process.env.GOOGLE_CLIENT_ID = "";
		process.env.GOOGLE_CLIENT_SECRET = "";
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.isGoogleEnabled, {})).resolves.toBe(false);
	});

	test("isGoogleEnabled returns true when both Google env vars are set", async () => {
		process.env.GOOGLE_CLIENT_ID = "test-id.apps.googleusercontent.com";
		process.env.GOOGLE_CLIENT_SECRET = "test-secret";
		const t = convexTest(schema, modules);

		await expect(t.query(api.auth.isGoogleEnabled, {})).resolves.toBe(true);
	});
});
