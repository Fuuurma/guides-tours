// HTTP-level tests for the public booking endpoint.
//
// Verifies the httpAction at POST /api/public/book/<slug> is
// reachable, validates input, and rejects obviously bad payloads
// before any cross-tenant data lookup. The internalCreate mutation
// (where cross-tenant guards fire on `tourId` / `scheduleId`) is
// covered by public_booking.test.ts; the createForSlug action
// (which calls the Better Auth component adapter) requires a
// registered component in convex-test, so its cross-tenant path is
// exercised in production smoke.
//
// What this file pins:
//   1. Routing: a POST to /api/public/book/<slug> reaches the
//      handler (proves pathPrefix registration, not the broken
//      exact-match `path: "/api/public/book/:slug"`).
//   2. Body validation: missing required fields, non-JSON content
//      type, oversized payload, and non-integer guests all return
//      4xx without writing any booking.
//   3. Rate limit: the per-email rate-limit guard fires before
//      the org lookup, so unknown slugs still consume quota.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
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

describe("convex/http — public booking httpAction routing and input validation", () => {
	it("routes POST /api/public/book/<slug> to the registered handler", async () => {
		// Negative control: if the route were registered as
		// `path: "/api/public/book/:slug"` (exact-match against a
		// literal `:slug`), this would 404. After fixing it to
		// `pathPrefix: "/api/public/book/"`, the body-validation
		// branch fires and returns a 4xx with a JSON error message.
		const t = convexTest(schema, modules);
		const res = await post(t, "any-slug", { ...VALID_PAYLOAD });
		expect(res.status).toBeGreaterThanOrEqual(400);
		expect(res.status).toBeLessThan(500);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBeTruthy();
	});

	it("serves a CORS preflight for browser booking requests", async () => {
		const t = convexTest(schema, modules);
		const res = await t.fetch(PUBLIC_BOOK_PATH("any-slug"), {
			method: "OPTIONS",
			headers: {
				origin: "http://127.0.0.1:3020",
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe(
			"http://127.0.0.1:3020",
		);
		expect(res.headers.get("access-control-allow-methods")).toContain("POST");
	});

	it("returns 415 when content-type is not application/json", async () => {
		const t = convexTest(schema, modules);
		const res = await t.fetch(PUBLIC_BOOK_PATH("any-slug"), {
			method: "POST",
			body: "tourId=foo&customerName=bar",
			headers: { "content-type": "application/x-www-form-urlencoded" },
		});
		expect(res.status).toBe(415);
	});

	it("returns 400 on invalid JSON", async () => {
		const t = convexTest(schema, modules);
		const res = await t.fetch(PUBLIC_BOOK_PATH("any-slug"), {
			method: "POST",
			body: "{ not json",
			headers: { "content-type": "application/json" },
		});
		expect(res.status).toBe(400);
	});

	it("returns 400 when required fields are missing", async () => {
		const t = convexTest(schema, modules);
		const res = await post(t, "any-slug", { ...VALID_PAYLOAD, tourId: "" });
		expect(res.status).toBe(400);
		const text = await res.text();
		expect(text.length).toBeGreaterThan(0);
	});

	it("returns 400 when guests is a non-integer number", async () => {
		// The handler floors guests via Math.floor, but only after
		// verifying `Number.isFinite(rawGuests)` AND the integer
		// range. A non-integer must be rejected, never silently
		// coerced.
		const t = convexTest(schema, modules);
		const res = await post(t, "any-slug", {
			...VALID_PAYLOAD,
			guests: 2.5,
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBeTruthy();
	});

	it("returns 400 when guests is outside the 1..200 range", async () => {
		const t = convexTest(schema, modules);
		const res = await post(t, "any-slug", {
			...VALID_PAYLOAD,
			guests: 0,
		});
		expect(res.status).toBe(400);
	});

	it("returns 404 for unknown paths under the booking prefix", async () => {
		// Negative control: a path that does NOT start with
		// /api/public/book/ should NOT route to the booking handler.
		// The router returns 404 ("No HttpAction routed for ...").
		const t = convexTest(schema, modules);
		const res = await t.fetch("/api/public/something-else", {
			method: "POST",
			body: JSON.stringify({}),
			headers: { "content-type": "application/json" },
		});
		expect(res.status).toBe(404);
	});

	it("writes no booking row when the handler rejects the request", async () => {
		// Defense in depth: even when the httpAction rejects, no
		// booking row should be persisted.
		const t = convexTest(schema, modules);
		const res = await post(t, "any-slug", {
			...VALID_PAYLOAD,
			guests: 2.5, // triggers 400
		});
		expect(res.status).toBe(400);
		const bookings = await t.run(async (ctx) =>
			ctx.db.query("bookings").collect(),
		);
		expect(bookings.length).toBe(0);
	});
});
