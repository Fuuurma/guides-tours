import { afterEach, describe, expect, it, vi } from "vitest";
import { getSafeDisplayMessage } from "@/lib/utils";

/**
 * getSafeDisplayMessage must pass authored ConvexError strings through
 * while redacting operational/infra text (request IDs, plan-limit
 * notices, network failures, JS engine TypeErrors). Regression: the
 * public booking page rendered a raw Convex plan-limits blob verbatim.
 */

const FALLBACK = "Something went wrong. Please try again.";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("getSafeDisplayMessage", () => {
	it("passes authored messages through", () => {
		expect(getSafeDisplayMessage(new Error("Tour not found"))).toBe(
			"Tour not found",
		);
	});

	it("redacts Convex plan-limit blobs", () => {
		const blob = new Error(
			"[CONVEX Q(public_booking:getOrgAndToursBySlug)] [Request ID: fibc4141936789e3] " +
				"Server Error You have exceeded the free plan limits, so your deployments " +
				"have been disabled. Please upgrade to a Pro plan or reach out to us at " +
				"support@convex.dev for help. Called By client",
		);
		expect(getSafeDisplayMessage(blob)).toBe(FALLBACK);
	});

	it("redacts request IDs, network failures, and engine TypeErrors", () => {
		for (const msg of [
			"Query failed [Request ID: abc123]",
			"Failed to fetch",
			"Load failed",
			"Cannot read properties of undefined (reading 'tours')",
			"undefined is not an object",
			"Internal Server Error",
			"Validator error: bad arg",
		]) {
			expect(getSafeDisplayMessage(new Error(msg))).toBe(FALLBACK);
		}
	});

	it("redacts overlong messages as infra spew", () => {
		expect(getSafeDisplayMessage(new Error("x".repeat(161)))).toBe(FALLBACK);
		expect(getSafeDisplayMessage(new Error("y".repeat(160)))).toBe(
			"y".repeat(160),
		);
	});

	it("falls back for non-Error values", () => {
		expect(getSafeDisplayMessage("plain string")).toBe(FALLBACK);
		expect(getSafeDisplayMessage(null)).toBe(FALLBACK);
		expect(getSafeDisplayMessage(undefined)).toBe(FALLBACK);
	});

	it("logs redacted originals to console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		getSafeDisplayMessage(new Error("Failed to fetch"));
		expect(spy).toHaveBeenCalledWith(
			"[ui-error] redacted operational message:",
			"Failed to fetch",
		);
		spy.mockClear();
		getSafeDisplayMessage(new Error("Tour not found"));
		expect(spy).not.toHaveBeenCalled();
	});
});
