// HTTP-level cross-tenant tests for the public booking endpoint.
//
// Pinned by this file (in addition to the eight tests in
// `public_booking_http.test.ts` that cover routing and body
// validation):
//
//   9. The createForSlug action — and therefore the httpAction —
//      resolves the organization by slug through the Better Auth
//      component adapter. This file wires up a tiny mock of the
//      adapter (`convex/__tests__/betterAuthMock/`) so the httpAction
//      can be exercised end-to-end at the HTTP boundary, including
//      the cross-tenant guards that live in `internalCreate`.
//
//  10. A POST to /api/public/book/<slug-org-A> with a `tourId`
//      that belongs to a foreign org (org B) returns 4xx and
//      does NOT persist a booking row anywhere.
//
//  11. A POST to /api/public/book/<slug-org-A> with a `scheduleId`
//      that belongs to a foreign org (org B) returns 4xx and
//      does NOT persist a booking row.
//
//  12. The cross-tenant action rejection still records the
//      `publicBookingAttempts` row (rate-limit observability) but
//      leaves `bookings` empty.
//
//  13. An unknown slug returns 4xx without writing a booking
//      row (proves the org-by-slug lookup is hit, not bypassed).
//
// Why a mock? The real `@convex-dev/better-auth` component is a
// local-install; convex-test cannot mount it. The mock component
// only implements the single function the public-booking flow
// calls (`adapter.findOne`) and reads from a module-scoped
// in-memory map populated by the test.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { seedTour, seedSchedule } from "./helpers";
import {
	registerBetterAuthMock,
	resetMockOrgs,
	seedMockOrg,
} from "../../test-utils/betterAuthMock";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const PUBLIC_BOOK_PATH = (slug: string) => `/api/public/book/${slug}`;

const VALID_PAYLOAD = {
	customerName: "Cross Tenant Visitor",
	customerEmail: "cross-tenant@example.com",
	date: "2027-08-15",
	startTime: "10:00",
	guests: 2,
};

async function post(
	t: ReturnType<typeof convexTest>,
	slug: string,
	body: Record<string, unknown>,
) {
	return await t.fetch(PUBLIC_BOOK_PATH(slug), {
		method: "POST",
		body: JSON.stringify(body),
		headers: { "content-type": "application/json" },
	});
}

async function setupTwoOrgs() {
	const t = convexTest(schema, modules);
	registerBetterAuthMock(t);
	// Two orgs in the Better Auth mock component. The public
	// booking flow resolves an org by slug via the betterAuth
	// component adapter (`ctx.runQuery(...findOne, ...)`); it
	// does NOT read from an app-side `organizations` table. The
	// `tours` / `tourSchedules` rows live in the app's own DB
	// and are seeded via the shared `helpers.ts` helpers.
	const orgA = seedMockOrg({ id: "org_cross_a", slug: "alpha" });
	const orgB = seedMockOrg({ id: "org_cross_b", slug: "beta" });
	return { t, orgA, orgB };
}

describe("convex/http — public booking cross-tenant guards at the httpAction boundary", () => {
	beforeEach(() => {
		resetMockOrgs();
	});

	it("registers and serves a healthy booking for an org's own tour", async () => {
		const { t, orgA } = await setupTwoOrgs();
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: orgA.id }),
		);
		const res = await post(t, "alpha", { ...VALID_PAYLOAD, tourId });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { bookingId?: string; status?: string };
		expect(body.bookingId).toBeTruthy();
		expect(body.status).toBe("pending");
		const bookings = await t.run(async (ctx) => ctx.db.query("bookings").collect());
		expect(bookings.length).toBe(1);
		expect(bookings[0].organizationId).toBe(orgA.id);
	});

	it("resolves Better Auth organizations returned with a Convex _id", async () => {
		const t = convexTest(schema, modules);
		registerBetterAuthMock(t);
		const org = seedMockOrg({
			id: "org_convex_id",
			slug: "convex-id",
			idField: "_id",
		});
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: org.id }),
		);

		const res = await post(t, org.slug, { ...VALID_PAYLOAD, tourId });

		expect(res.status).toBe(200);
		const body = (await res.json()) as { bookingId?: string };
		expect(body.bookingId).toBeTruthy();
		const bookings = await t.run(async (ctx) =>
			ctx.db.query("bookings").collect(),
		);
		expect(bookings).toHaveLength(1);
		expect(bookings[0].organizationId).toBe(org.id);
	});

	it("rejects a POST to /api/public/book/<org-A-slug> with a hostile tourId from org B", async () => {
		const { t, orgA, orgB } = await setupTwoOrgs();
		// Tour belongs to org B; the request says it belongs to org A.
		const hostileTourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: orgB.id, name: "Beta Secret Tour" }),
		);
		const res = await post(t, orgA.slug, {
			...VALID_PAYLOAD,
			tourId: hostileTourId,
		});
		// `internalCreate` throws "Tour not found" when the tour
		// is from a different org; the httpAction maps that to 404.
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toMatch(/not found/i);
		const bookings = await t.run(async (ctx) => ctx.db.query("bookings").collect());
		expect(bookings.length).toBe(0);
	});

	it("rejects a POST to /api/public/book/<org-A-slug> with a hostile scheduleId from org B", async () => {
		const { t, orgA, orgB } = await setupTwoOrgs();
		// Tour + schedule in org B.
		const hostileTourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: orgB.id }),
		);
		const hostileScheduleId = await t.run(async (ctx) =>
			seedSchedule(ctx, {
				orgId: orgB.id,
				tourId: hostileTourId,
			}),
		);
		// Tour in org A (so the body doesn't trip "Tour not found"
		// before the schedule check fires).
		const legitTourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: orgA.id, name: "Alpha legit" }),
		);
		const res = await post(t, orgA.slug, {
			...VALID_PAYLOAD,
			tourId: legitTourId,
			scheduleId: hostileScheduleId,
		});
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toMatch(/schedule/i);
		const bookings = await t.run(async (ctx) => ctx.db.query("bookings").collect());
		expect(bookings.length).toBe(0);
	});

	it("rejects a POST to /api/public/book/<unknown-slug> and writes no booking", async () => {
		const t = convexTest(schema, modules);
		registerBetterAuthMock(t);
		// No orgs seeded at all.
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: "org_none", name: "Ghost tour" }),
		);
		const res = await post(t, "ghost-slug", { ...VALID_PAYLOAD, tourId });
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toMatch(/organization not found/i);
		const bookings = await t.run(async (ctx) => ctx.db.query("bookings").collect());
		expect(bookings.length).toBe(0);
	});

	it("cross-tenant rejection still records the publicBookingAttempts row", async () => {
		const { t, orgA, orgB } = await setupTwoOrgs();
		const hostileTourId = await t.run(async (ctx) =>
			seedTour(ctx, { orgId: orgB.id }),
		);
		await post(t, orgA.slug, { ...VALID_PAYLOAD, tourId: hostileTourId });
		// The rate-limit observability table must still capture
		// the attempt, even though no booking was created.
		const attempts = await t.run(async (ctx) =>
			ctx.db.query("publicBookingAttempts").collect(),
		);
		expect(attempts.length).toBeGreaterThan(0);
		const lastAttempt = attempts[attempts.length - 1];
		expect(lastAttempt.email).toBe(VALID_PAYLOAD.customerEmail);
		expect(lastAttempt.slug).toBe(orgA.slug);
	});
});
