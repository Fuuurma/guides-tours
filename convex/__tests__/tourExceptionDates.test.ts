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

describe("tour exception dates", () => {
	it("create: stores ADDED exception", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourExceptionDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-12-25",
			exceptionType: "added",
			reason: "Christmas special",
		});
		expect(id).toBeDefined();
	});

	it("create: MODIFIED requires startTime + endTime", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourExceptionDates.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				date: "2026-07-04",
				exceptionType: "modified",
				// missing startTime/endTime
			}),
		).rejects.toThrow(/require startTime/);
	});

	it("create: MODIFIED rejects endTime < startTime", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourExceptionDates.internalCreate, {
				organizationId: orgId,
				userId: "user-1",
				tourId,
				date: "2026-07-04",
				exceptionType: "modified",
				startTime: "11:00",
				endTime: "09:00",
			}),
		).rejects.toThrow(/on or after/);
	});

	it("create: REMOVED exception with no times", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex4";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourExceptionDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-12-25",
			exceptionType: "removed",
			reason: "Closed for Christmas",
		});
		expect(id).toBeDefined();
	});

	it("update: patches reason", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex5";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourExceptionDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-12-25",
			exceptionType: "removed",
			reason: "original",
		});
		await t.mutation(internal.tourExceptionDates.internalUpdate, {
			organizationId: orgId,
			userId: "user-1",
			exceptionId: id,
			reason: "updated reason",
		});
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.reason).toBe("updated reason");
	});

	it("update: rejects endTime < startTime", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex6";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourExceptionDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-07-04",
			exceptionType: "modified",
			startTime: "09:00",
			endTime: "11:00",
		});
		await expect(
			t.mutation(internal.tourExceptionDates.internalUpdate, {
				organizationId: orgId,
				userId: "user-1",
				exceptionId: id,
				endTime: "08:00",
			}),
		).rejects.toThrow(/on or after/);
	});

	it("remove: deletes exception", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ex7";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourExceptionDates.internalCreate, {
			organizationId: orgId,
			userId: "user-1",
			tourId,
			date: "2026-12-25",
			exceptionType: "removed",
		});
		await t.mutation(internal.tourExceptionDates.internalRemove, {
			organizationId: orgId,
			userId: "user-1",
			exceptionId: id,
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});
});