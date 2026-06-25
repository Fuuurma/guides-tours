import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: any, orgId: string) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "T",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: 10,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 10,
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

describe("tour seasonal schedules", () => {
	it("create: stores schedule", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourSeasonalSchedules.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "Summer Daily",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [1, 3, 5],
				startTime: "10:00",
				capacityOverride: 15,
			},
		);
		expect(id).toBeDefined();
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.daysOfWeek).toEqual([1, 3, 5]);
		expect(row?.isActive).toBe(true);
	});

	it("create: rejects end before start", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourSeasonalSchedules.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "Bad",
				startDate: "2026-08-31",
				endDate: "2026-06-01",
				daysOfWeek: [1],
			}),
		).rejects.toThrow(/on or after/);
	});

	it("create: rejects invalid day of week", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourSeasonalSchedules.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "Bad",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [7], // invalid
			}),
		).rejects.toThrow(/0\.\.6/);
	});

	it("create: rejects capacity <= 0", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss4";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourSeasonalSchedules.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "Bad",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [1],
				capacityOverride: 0,
			}),
		).rejects.toThrow(/positive/);
	});

	it("update: patches fields and validates endDate", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss5";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourSeasonalSchedules.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "X",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [1],
			},
		);
		// Should fail because endDate (2026-05-01) < startDate (2026-06-01)
		await expect(
			t.mutation(internal.tourSeasonalSchedules.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				scheduleId: id,
				endDate: "2026-05-01",
			}),
		).rejects.toThrow(/on or after/);
	});

	it("update: rejects wrong org", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss6a";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourSeasonalSchedules.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "X",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [1],
			},
		);
		await expect(
			t.mutation(internal.tourSeasonalSchedules.internalUpdate, {
				organizationId: "org_ss6b",
				userId: "user-1",
				scheduleId: id,
				name: "hacked",
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes schedule", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ss7";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourSeasonalSchedules.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				name: "X",
				startDate: "2026-06-01",
				endDate: "2026-08-31",
				daysOfWeek: [1],
			},
		);
		await t.mutation(internal.tourSeasonalSchedules.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			scheduleId: id,
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});
});