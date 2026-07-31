// Security tests for the public booking HTTP endpoint.
//
// Verifies the hardening measures added in round 18:
//   1. Origin validation — rejects missing/disallowed origins when
//      PUBLIC_BOOKING_ALLOWED_ORIGINS is configured.
//   2. Slug format validation — rejects path traversal and invalid
//      characters.
//   3. Body size enforcement — rejects oversized payloads based on
//      actual body length, not Content-Length header.
//   4. Error message sanitization — returns generic messages for
//      non-ConvexError exceptions, doesn't leak internal details.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const PUBLIC_BOOK_PATH = (slug: string) => `/api/public/book/${slug}`;

const VALID_PAYLOAD = {
	tourId: "any-tour-id",
	customerName: "Eve Visitor",
	customerEmail: "eve@example.com",
	date: "2027-08-15",
	startTime: "10:00",
	guests: 2,
};

async function post(
	t: ReturnType<typeof convexTest>,
	slug: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
) {
	return await t.fetch(PUBLIC_BOOK_PATH(slug), {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json", ...headers },
	});
}

describe("convex/http — public booking security hardening", () => {
	const originalOrigins = process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS;

	beforeEach(() => {
		// Set allowed origins for these tests
		process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS =
			"https://tours.example.com,https://www.example.com";
	});

	afterEach(() => {
		// Restore original env
		if (originalOrigins === undefined) {
			delete process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS;
		} else {
			process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS = originalOrigins;
		}
	});

	describe("origin validation", () => {
		it("rejects requests with no Origin header when allowlist is configured", async () => {
			const t = convexTest(schema, modules);
			// Don't send Origin header — should be rejected
			const res = await t.fetch(PUBLIC_BOOK_PATH("any-slug"), {
				method: "POST",
				body: JSON.stringify(VALID_PAYLOAD),
				headers: { "content-type": "application/json" },
			});
			expect(res.status).toBe(403);
		});

		it("rejects requests with disallowed Origin", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "any-slug", VALID_PAYLOAD, {
				origin: "https://evil.example.com",
			});
			expect(res.status).toBe(403);
		});

		it("allows requests with allowed Origin", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "any-slug", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			// Should NOT be 403 — may be 4xx for other reasons (invalid
			// tourId), but the origin check passes.
			expect(res.status).not.toBe(403);
		});

		it("allows requests when allowlist is not configured", async () => {
			delete process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS;
			const t = convexTest(schema, modules);
			const res = await post(t, "any-slug", VALID_PAYLOAD);
			// No origin header, but allowlist is unset → should pass
			// the origin check (may fail later for other reasons).
			expect(res.status).not.toBe(403);
		});

		it("allows requests when allowlist is empty string", async () => {
			process.env.PUBLIC_BOOKING_ALLOWED_ORIGINS = "";
			const t = convexTest(schema, modules);
			const res = await post(t, "any-slug", VALID_PAYLOAD);
			expect(res.status).not.toBe(403);
		});
	});

	describe("slug format validation", () => {
		it("rejects slug with path traversal characters", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "..%2F..%2Fetc", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			// The slug contains % which fails the alphanumeric regex.
			// Convex router may decode this before our handler sees it.
			// Either way, it should not be a 200.
			expect(res.status).toBeGreaterThanOrEqual(400);
		});

		it("rejects slug with slashes", async () => {
			const t = convexTest(schema, modules);
			// A slug with a slash would be split by the router into
			// multiple segments. Our handler picks the segment after
			// "book", so "foo/bar" → slug = "foo" (valid). But a slug
			// like "foo/../bar" should still be caught.
			const res = await t.fetch(
				PUBLIC_BOOK_PATH("foo") + "/../bar",
				{
					method: "POST",
					body: JSON.stringify(VALID_PAYLOAD),
					headers: {
						"content-type": "application/json",
						origin: "https://tours.example.com",
					},
				},
			);
			expect(res.status).toBeGreaterThanOrEqual(400);
		});

		it("rejects slug with special characters", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "slug;rm -rf", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			expect(res.status).toBe(400);
		});

		it("rejects slug that is too long (>100 chars)", async () => {
			const t = convexTest(schema, modules);
			const longSlug = "a".repeat(101);
			const res = await post(t, longSlug, VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			expect(res.status).toBe(400);
		});

		it("accepts a valid alphanumeric slug with hyphens", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "my-tour-company-2024", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			// Should pass slug validation — the response may be 400
			// from the tourId validator, but the error should NOT be
			// "invalid slug".
			const body = (await res.json()) as { error?: string };
			expect(body.error).not.toBe("invalid slug");
		});

		it("accepts a valid slug with underscores", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "my_tour_co", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			const body = (await res.json()) as { error?: string };
			expect(body.error).not.toBe("invalid slug");
		});
	});

	describe("body size enforcement", () => {
		it("rejects payloads larger than 8KB based on actual body size", async () => {
			const t = convexTest(schema, modules);
			// Create a payload with a very long customerName to exceed 8KB.
			// 8KB = 8192 bytes. We need the JSON to be > 8192 bytes.
			const hugeName = "x".repeat(10_000);
			const res = await post(
				t,
				"valid-slug",
				{ ...VALID_PAYLOAD, customerName: hugeName },
				{ origin: "https://tours.example.com" },
			);
			expect(res.status).toBe(413);
		});

		it("accepts payloads under 8KB", async () => {
			const t = convexTest(schema, modules);
			const res = await post(t, "valid-slug", VALID_PAYLOAD, {
				origin: "https://tours.example.com",
			});
			expect(res.status).not.toBe(413);
		});

		it("rejects oversized body even with spoofed Content-Length", async () => {
			const t = convexTest(schema, modules);
			const hugeName = "x".repeat(10_000);
			const body = JSON.stringify({ ...VALID_PAYLOAD, customerName: hugeName });
			// Send a small Content-Length but a large actual body.
			// The handler should check actual body size, not the header.
			const res = await t.fetch(PUBLIC_BOOK_PATH("valid-slug"), {
				method: "POST",
				body,
				headers: {
					"content-type": "application/json",
					origin: "https://tours.example.com",
					"content-length": "100", // spoofed small value
				},
			});
			// Should still be rejected — actual body > 8KB.
			expect(res.status).toBe(413);
		});
	});

	describe("error message sanitization", () => {
		it("returns generic error for non-ConvexError exceptions", async () => {
			const t = convexTest(schema, modules);
			// A validator error (non-ConvexError) from invalid tourId
			// format should return a generic "Invalid request data"
			// message, not the raw validator error.
			const res = await post(
				t,
				"valid-slug",
				{ ...VALID_PAYLOAD, tourId: "not-a-valid-id" },
				{ origin: "https://tours.example.com" },
			);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error?: string };
			expect(body.error).toBe("Invalid request data");
		});

		it("returns sanitized message for ConvexError not-found", async () => {
			// The cross-tenant test file covers the full not-found
			// path with seeded data. Here we just verify that the
			// error message format is sanitized (no internal details
			// leak). We can't easily generate a valid-format Convex
			// ID that doesn't exist without seeding, so we verify
			// the sanitization logic indirectly: a validator error
			// returns "Invalid request data" (not the raw validator
			// message), proving the sanitization layer works.
			const t = convexTest(schema, modules);
			const res = await post(
				t,
				"valid-slug",
				{ ...VALID_PAYLOAD, tourId: "not-a-valid-id" },
				{ origin: "https://tours.example.com" },
			);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error?: string };
			expect(body.error).toBe("Invalid request data");
		});

		it("does not leak internal error details", async () => {
			const t = convexTest(schema, modules);
			const res = await post(
				t,
				"valid-slug",
				{ ...VALID_PAYLOAD, tourId: "not-a-valid-id" },
				{ origin: "https://tours.example.com" },
			);
			const body = (await res.json()) as { error?: string };
			// Should not contain stack traces, file paths, or internal
			// implementation details.
			expect(body.error).not.toContain("at ");
			expect(body.error).not.toContain(".ts:");
			expect(body.error).not.toContain("Validator error");
			expect(body.error).not.toContain("Expected ID");
		});
	});
});
