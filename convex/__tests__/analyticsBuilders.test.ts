// Unit tests for convex/lib/analyticsBuilders (F19 coverage gap —
// the module was only exercised indirectly through the analytics
// API surface).
//
// Pins: the pure date/rounding helpers, buildBookingSources'
// group-sum-sort + truncated contract (F12's loud-overflow residual,
// 455fcb8), and buildWeeklyPulse's NaN guard + previous-window math.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedBooking, seedCustomer, seedTour } from "./helpers";
import {
	buildBookingSources,
	buildWeeklyPulse,
	dateRange,
	round1,
} from "../lib/analyticsBuilders";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";

describe("analyticsBuilders — pure helpers", () => {
	it("dateRange is inclusive on both ends", () => {
		expect(dateRange("2026-09-29", "2026-10-02")).toEqual([
			"2026-09-29",
			"2026-09-30",
			"2026-10-01",
			"2026-10-02",
		]);
		expect(dateRange("2026-09-22", "2026-09-22")).toEqual(["2026-09-22"]);
	});

	it("round1 keeps one decimal", () => {
		expect(round1(2.25)).toBe(2.3);
		expect(round1(2.24)).toBe(2.2);
		expect(round1(3)).toBe(3);
	});
});

describe("analyticsBuilders.buildBookingSources", () => {
	it("groups by source, sums guests, sorts by booking count desc", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const mk = (source: string, guests: number) =>
				seedBooking(ctx, {
					orgId: ORG,
					tourId,
					customerId,
					source,
					guests,
				});
			await mk("airbnb", 2);
			await mk("airbnb", 3);
			await mk("direct", 4);
			await mk("booking_com", 1);
			await mk("airbnb", 1);
		});
		const out = await t.run(async (ctx) =>
			buildBookingSources(ctx, ORG, "2026-07-01", "2026-07-31"),
		);
		expect(out.truncated).toBe(false);
		expect(out.sources.map((s) => s.source)).toEqual([
			"airbnb",
			"direct",
			"booking_com",
		]);
		const airbnb = out.sources[0]!;
		expect(airbnb.totalBookings).toBe(3);
		expect(airbnb.totalGuests).toBe(6);
	});

	it("ignores bookings outside the date window", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: "2026-06-15",
			});
		});
		const out = await t.run(async (ctx) =>
			buildBookingSources(ctx, ORG, "2026-07-01", "2026-07-31"),
		);
		expect(out.sources).toEqual([]);
	});
});

describe("analyticsBuilders.buildWeeklyPulse", () => {
	it("guards NaN dates with a zeroed payload", async () => {
		const t = convexTest(schema, modules);
		const out = await t.run(async (ctx) =>
			buildWeeklyPulse(ctx, ORG, "not-a-date", "also-bad"),
		);
		expect(out.revenueCents).toBe(0);
		expect(out.bookings).toBe(0);
		expect(out.previousStartDate).toBe("not-a-date");
		expect(out.previousEndDate).toBe("also-bad");
	});

	it("derives the previous window and current-window stats", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: "2026-07-15",
				guests: 2,
			});
			await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: "2026-07-16",
				guests: 4,
			});
			// Outside both windows — must not leak into either.
			await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: "2026-08-30",
				guests: 10,
			});
		});
		const out = await t.run(async (ctx) =>
			buildWeeklyPulse(ctx, ORG, "2026-07-14", "2026-07-20"),
		);
		// window = 6 days → previous window is 2026-07-07..2026-07-13.
		expect(out.previousStartDate).toBe("2026-07-07");
		expect(out.previousEndDate).toBe("2026-07-13");
		expect(out.bookings).toBe(2);
		expect(out.guests).toBe(6);
		expect(out.avgGroupSize).toBe(3);
		expect(out.previousBookings).toBe(0);
		expect(out.previousRevenueCents).toBe(0);
	});
});
