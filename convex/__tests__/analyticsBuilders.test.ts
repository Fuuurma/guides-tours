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
import { seedBooking, seedCustomer, seedTour, type TestCtx } from "./helpers";
import {
	buildBookingSources,
	buildChannelRevenue,
	buildFinancialHealth,
	buildForTour,
	buildGuideStats,
	buildRevenueSummary,
	buildTopTours,
	buildTourStats,
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

	// F710: caller bounds are bare v.string() — an unpadded bound must be
	// rejected, not lexicographically compared. "2026-1-1" <= "2026-3-1"
	// used to hold, inflating a 2-month window into ~365 zero-filled rows;
	// a non-date bound walked Date.parse into NaN and iterated NaN keys.
	it("dateRange rejects unpadded and non-date bounds", () => {
		expect(() => dateRange("2026-1-1", "2026-3-1")).toThrow(
			/Invalid date range bound/,
		);
		expect(() => dateRange("2026-01-01", "2026-3-1")).toThrow(
			/Invalid date range bound/,
		);
		expect(() => dateRange("garbage", "2026-03-01")).toThrow(
			/Invalid date range bound/,
		);
		expect(() => dateRange("2026-02-31", "2026-03-01")).toThrow(
			/Invalid date range bound/,
		);
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

// F722: the eight analytics builders that feed index scans take bare
// v.string() bounds. An unpadded "2026-1-1" sorts ahead of "2026-10-…"
// lexicographically and Date.parse(`${s}T00:00:00Z`) yields NaN — both
// widen the scan (scout probe: outstandingCents 7000 where 5000 was
// correct; a cleared picker sends ""). They must reject coded like
// dateRange does before a single row is read.
describe("F722 — date-bounded builders reject malformed bounds", () => {
	const CALLERS: ReadonlyArray<
		readonly [
			string,
			(ctx: TestCtx, start: string, end: string) => Promise<unknown>,
		]
	> = [
		["buildTourStats", (ctx, s, e) => buildTourStats(ctx, ORG, s, e)],
		["buildGuideStats", (ctx, s, e) => buildGuideStats(ctx, ORG, s, e)],
		[
			"buildRevenueSummary",
			(ctx, s, e) => buildRevenueSummary(ctx, ORG, s, e),
		],
		[
			"buildChannelRevenue",
			(ctx, s, e) => buildChannelRevenue(ctx, ORG, s, e),
		],
		[
			"buildFinancialHealth",
			(ctx, s, e) => buildFinancialHealth(ctx, ORG, s, e),
		],
		["buildTopTours", (ctx, s, e) => buildTopTours(ctx, ORG, s, e, 10)],
		[
			"buildForTour",
			async (ctx, s, e) => {
				const tourId = await seedTour(ctx, { orgId: ORG });
				return buildForTour(ctx, ORG, tourId, s, e);
			},
		],
		[
			"buildBookingSources",
			(ctx, s, e) => buildBookingSources(ctx, ORG, s, e),
		],
	];
	const BAD_BOUNDS: ReadonlyArray<readonly [string, string, string]> = [
		["unpadded", "2026-1-1", "2026-3-1"],
		["empty (cleared picker)", "", ""],
		["non-date", "garbage", "2026-03-01"],
	];

	for (const [builder, call] of CALLERS) {
		for (const [label, start, end] of BAD_BOUNDS) {
			it(`${builder} rejects ${label} bounds`, async () => {
				const t = convexTest(schema, modules);
				await expect(
					t.run(async (ctx) => call(ctx, start, end)),
				).rejects.toThrow(/Invalid date range bound/);
			});
		}
	}

	it("valid bounds still resolve for every builder", async () => {
		const t = convexTest(schema, modules);
		for (const [, call] of CALLERS) {
			await t.run(async (ctx) => call(ctx, "2026-07-01", "2026-07-31"));
		}
	});
});
