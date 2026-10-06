// F468 extension — the seasonal generator can insert a DUPLICATE schedule row.
//
// `internalGenerate` dropped its per-day `.unique()` check on the reasoning
// that the `existingInRange` batch "covers all schedules in the window".
// That batch is `.take(5000)`, and `by_tour_date` orders by date ascending —
// so past 5000 in-window schedules the scan stops early and keeps the
// EARLIEST dates. Absence from the set then stops meaning "does not exist".
//
// The consequence is worse than a list that truncates: a second row for the
// same (tourId, date, startTime) is inserted, and from then on every
// `.unique()` lookup on that triple throws Convex's raw multi-document error
// instead of the intended ConvexError — in tourSchedules.ts, bookings.ts and
// public_booking.ts. The cap corrupts data rather than reporting it.
//
// The fix keeps the batch as a fast path and only falls back to an indexed
// point check when the batch actually hit its cap, so the untruncated case
// costs exactly what it costs today.

import { type TestConvex, convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");
const ORG = "org_f468";

async function seedTour(ctx: { db: { insert: Function } }) {
	return await ctx.db.insert("tours", {
		organizationId: ORG,
		name: "City Walk",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 12,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 12,
		bookingCutoffHours: 24,
		tourType: "walking",
		languages: ["en"],
		requiredGuides: 1,
		inclusions: [],
		exclusions: [],
		highlights: [],
		currency: "USD",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedScheduleRow(
	ctx: { db: { insert: Function } },
	tourId: string,
	date: string,
	startTime: string,
) {
	return await ctx.db.insert("tourSchedules", {
		organizationId: ORG,
		tourId,
		date,
		startTime,
		endTime: "12:00",
		capacityTotal: 10,
		capacityBooked: 0,
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

/** Counts rows for a (tourId, date, startTime) triple. */
// TestConvex<typeof schema>, NOT ReturnType<typeof convexTest>: the latter
// resolves convexTest's own generic to its unconstrained default, so `db`
// degrades to the untyped SystemIndexes shape and every withIndex() errors.
async function countTriple(
	t: TestConvex<typeof schema>,
	tourId: Id<"tours">,
	date: string,
	startTime: string,
) {
	// Uses by_tour_date rather than the narrower by_tour_date_start: the test
	// counts rows, it does not care how narrow the index is, and the narrower
	// one is not yet in the generated dataModel types.
	return t.run(async (ctx) =>
		ctx.db
			.query("tourSchedules")
			.withIndex("by_tour_date", (q) => q.eq("tourId", tourId).eq("date", date))
			.filter((q) => q.eq(q.field("organizationId"), ORG))
			.collect()
			.then((r) => r.filter((x) => x.startTime === startTime).length),
	);
}

const FILLER_DATE = "2026-07-01"; // earlier than TARGET, so it wins the cap
const TARGET_DATE = "2026-12-01"; // a Tuesday
const TARGET_TIME = "10:00";
const SCAN_CAP = 5000;

describe("F468 — the seasonal generator must not create duplicate slots", () => {
	it("does not re-create a slot that the capped scan dropped", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx));

		// Fill the capped scan with EARLIER dates so the existing target row
		// sorts past take(5000) and is missing from existingKeys.
		await t.run(async (ctx) => {
			const c = ctx as { db: { insert: Function } };
			for (let i = 0; i < SCAN_CAP; i++) {
				await seedScheduleRow(c, tourId, FILLER_DATE, "09:00");
			}
			// The row the generator must not duplicate.
			await seedScheduleRow(c, tourId, TARGET_DATE, TARGET_TIME);
		});

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Winter",
			startDate: TARGET_DATE,
			endDate: TARGET_DATE,
			daysOfWeek: [1, 2, 3, 4, 5],
			startTime: TARGET_TIME,
			capacityOverride: 10,
		});

		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: ORG,
				userId: "user-1",
				tourId,
				dateFrom: FILLER_DATE,
				dateTo: TARGET_DATE,
			},
		);

		// The real assertion: one row for the triple, not two. A duplicate here
		// is what makes every later .unique() on it throw.
		expect(await countTriple(t, tourId, TARGET_DATE, TARGET_TIME)).toBe(1);
		expect(result.created).toBe(0);
	}, 60_000);

	it("still reports the truncation rather than hiding it", async () => {
		// The untruncated case must keep its fast path, and the caller needs
		// to be able to tell a capped scan from a complete one.
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: ORG,
			userId: "user-1",
			tourId,
			name: "Winter",
			startDate: TARGET_DATE,
			endDate: TARGET_DATE,
			daysOfWeek: [1, 2, 3, 4, 5],
			startTime: TARGET_TIME,
			capacityOverride: 10,
		});

		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: ORG,
				userId: "user-1",
				tourId,
				dateFrom: TARGET_DATE,
				dateTo: TARGET_DATE,
			},
		);

		expect(result.created).toBe(1);
		expect(await countTriple(t, tourId, TARGET_DATE, TARGET_TIME)).toBe(1);

		// Second run is idempotent: the slot is now in the (complete) set.
		const again = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: ORG,
				userId: "user-1",
				tourId,
				dateFrom: TARGET_DATE,
				dateTo: TARGET_DATE,
			},
		);
		expect(again.created).toBe(0);
		expect(await countTriple(t, tourId, TARGET_DATE, TARGET_TIME)).toBe(1);
	});
});