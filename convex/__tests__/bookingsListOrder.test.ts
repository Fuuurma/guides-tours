// Ordering of the public bookings list (F139).
//
// The list query picks its index from the filters it is given. A Convex
// index scan iterates ASCENDING, so a branch that reads an index and
// forgets .order() returns the rows oldest-first — while the query's
// default sortOrder is 'desc'. The source-filtered and date-filtered
// branches did exactly that, so `list({source: "viator"})` rendered
// oldest-first and the newest bookings only showed up on a later page.
//
// The public query is auth-gated through requireMembership, which
// resolves a Better Auth session; convex-test cannot reach that. The
// membership is not what this file exercises, so it is faked — the
// ordering below is the real query's.

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

vi.mock("../lib/authz", async (importOriginal) => {
	const mod = await importOriginal<typeof import("../lib/authz")>();
	return {
		...mod,
		requireMembership: async () => ({
			userId: "user_bookings_order",
			organizationId: "org_bookings_order",
			role: "owner",
		}),
	};
});

const ORG_ID = "org_bookings_order";

async function seed(ctx: any) {
	const tourId = await ctx.db.insert("tours", {
		organizationId: ORG_ID,
		name: "Old Town Walk",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 15,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 15,
		bookingCutoffHours: 24,
		tourType: "walkable",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
	const customerId = await ctx.db.insert("customers", {
		organizationId: ORG_ID,
		name: "Alice",
		email: "alice@example.com",
		phone: "+15555550100",
		notes: "",
		smsConsent: false,
		emailConsent: true,
		preferredLanguage: "en",
		tags: [],
		source: "",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt: 0,
		updatedAt: 0,
	});
	const booking = (date: string, source: string) =>
		ctx.db.insert("bookings", {
			organizationId: ORG_ID,
			tourId,
			customerId,
			date,
			startTime: "10:00",
			guests: 2,
			guestNames: "",
			languageRequired: "en",
			notes: "",
			status: "confirmed",
			depositAmountCents: 0n,
			totalAmountCents: 10000n,
			balanceDueCents: 10000n,
			paymentMethod: "",
			checkedInBy: "",
			netRevenueCents: 10000n,
			source,
			reviewRating: undefined,
			reviewComment: "",
			createdAt: 0,
			updatedAt: 0,
		});
	return { booking };
}

describe("bookings.list — the filtered branches honour the requested order", () => {
	it("returns the newest first when a source filter is applied", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { booking } = await seed(ctx);
			await booking("2026-03-01", "viator");
			await booking("2026-03-05", "viator");
			await booking("2026-03-03", "viator");
			await booking("2026-03-04", "direct");
		});

		const result = await t.query(api.bookings.list, { source: "viator" });
		expect(result.items.map((b) => b.date)).toEqual([
			"2026-03-05",
			"2026-03-03",
			"2026-03-01",
		]);
	});

	it("returns the newest first when a date range is applied", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { booking } = await seed(ctx);
			await booking("2026-03-01", "direct");
			await booking("2026-03-05", "direct");
			await booking("2026-03-03", "direct");
			await booking("2026-04-01", "direct");
		});

		const result = await t.query(api.bookings.list, {
			dateFrom: "2026-03-01",
			dateTo: "2026-03-31",
		});
		expect(result.items.map((b) => b.date)).toEqual([
			"2026-03-05",
			"2026-03-03",
			"2026-03-01",
		]);
	});

	it("still returns the oldest first when the caller asks for ascending", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const { booking } = await seed(ctx);
			await booking("2026-03-01", "viator");
			await booking("2026-03-05", "viator");
			await booking("2026-03-03", "viator");
		});

		const result = await t.query(api.bookings.list, {
			source: "viator",
			sortOrder: "asc",
		});
		expect(result.items.map((b) => b.date)).toEqual([
			"2026-03-01",
			"2026-03-03",
			"2026-03-05",
		]);
	});
});
