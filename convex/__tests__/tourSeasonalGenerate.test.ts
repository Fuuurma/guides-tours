import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: { db: { insert: Function } }, orgId: string) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
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

describe("tourSeasonalSchedules.internalGenerate", () => {
	it("creates weekday schedules and skips blackout + weekend", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_gen1";

		const tourId = await t.run((ctx) => seedTour(ctx, orgId));

		await t.mutation(internal.tourSeasonalSchedules.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			name: "Summer weekdays",
			startDate: "2026-07-01",
			endDate: "2026-07-07",
			daysOfWeek: [1, 2, 3, 4, 5],
			startTime: "10:00",
			capacityOverride: 10,
		});

		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-07-03",
			endDate: "2026-07-03",
			reason: "Holiday",
		});

		// 2026-07-01 = Wed, 02=Thu, 03=Fri(blackout), 04=Sat, 05=Sun, 06=Mon, 07=Tue
		const result = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				dateFrom: "2026-07-01",
				dateTo: "2026-07-07",
			},
		);

		// Wed, Thu, Mon, Tue = 4 created; Fri blackout + Sat/Sun = skipped
		expect(result.created).toBe(4);
		expect(result.skipped).toBeGreaterThan(0);

		const schedules = await t.run(async (ctx) =>
			ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) => q.eq("tourId", tourId))
				.collect(),
		);
		expect(schedules).toHaveLength(4);
		expect(schedules.every((s) => s.startTime === "10:00")).toBe(true);
		expect(schedules.some((s) => s.date === "2026-07-03")).toBe(false);

		// Idempotent second run
		const again = await t.mutation(
			internal.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				dateFrom: "2026-07-01",
				dateTo: "2026-07-07",
			},
		);
		expect(again.created).toBe(0);
	});
});
