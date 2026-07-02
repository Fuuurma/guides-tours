import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import { isBlackoutHelper } from "../tourBlackoutDates";
import schema from "../schema";

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

describe("tour blackout dates", () => {
	it("create: stores blackout", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourBlackoutDates.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				startDate: "2026-12-24",
				endDate: "2026-12-26",
				reason: "Christmas",
			},
		);
		expect(id).toBeDefined();
		const b = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(b?.reason).toBe("Christmas");
	});

	it("create: rejects end before start", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourBlackoutDates.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				startDate: "2026-12-26",
				endDate: "2026-12-24",
			}),
		).rejects.toThrow(/on or after/);
	});

	it("update: rejects end < start", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourBlackoutDates.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				startDate: "2026-12-24",
				endDate: "2026-12-26",
			},
		);
		await expect(
			t.mutation(internal.tourBlackoutDates.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				blackoutId: id,
				startDate: "2026-12-27",
			}),
		).rejects.toThrow(/on or after/);
	});

	it("isBlackout: returns true for date inside range", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b4";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-12-24",
			endDate: "2026-12-26",
		});
		const result = await t.run((ctx) =>
			isBlackoutHelper(ctx as any, tourId, "2026-12-25"),
		);
		expect(result).toBe(true);
	});

	it("isBlackout: returns false outside range", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b5";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-12-24",
			endDate: "2026-12-26",
		});
		const result = await t.run((ctx) =>
			isBlackoutHelper(ctx as any, tourId, "2026-12-27"),
		);
		expect(result).toBe(false);
	});

	it("remove: deletes blackout", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_b6";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(
			internal.tourBlackoutDates.internalCreate,
			{
				organizationId: orgId,
				userId: "user-1",
				tourId,
				startDate: "2026-12-24",
				endDate: "2026-12-26",
			},
		);
		await t.mutation(internal.tourBlackoutDates.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			blackoutId: id,
		});
		const b = await t.run((ctx) => ctx.db.get(id));
		expect(b).toBeNull();
	});
});

describe("publicIsBlackout (no auth required)", () => {
	it("returns true for date inside range via public query", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-12-24",
			endDate: "2026-12-26",
		});
		// Call the PUBLIC query — no auth context, no requireMembership.
		const result = await t.query(api.tourBlackoutDates.publicIsBlackout, {
			tourId,
			date: "2026-12-25",
		});
		expect(result).toBe(true);
	});

	it("returns false for date outside range via public query", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.mutation(internal.tourBlackoutDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			startDate: "2026-12-24",
			endDate: "2026-12-26",
		});
		const result = await t.query(api.tourBlackoutDates.publicIsBlackout, {
			tourId,
			date: "2026-12-27",
		});
		expect(result).toBe(false);
	});
});
