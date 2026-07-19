import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: { db: { insert: Function } }, orgId: string) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Walk",
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

describe("tourSchedules uniqueness", () => {
	it("rejects duplicate tour+date+startTime on create", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sched_uniq";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));

		await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "u1",
			tourId,
			date: "2026-08-01",
			startTime: "10:00",
			endTime: "12:00",
			capacityTotal: 10,
		});

		await expect(
			t.mutation(internal.tourSchedules.internalCreate, {
				organizationId: orgId,
				userId: "u1",
				tourId,
				date: "2026-08-01",
				startTime: "10:00",
				endTime: "12:00",
				capacityTotal: 10,
			}),
		).rejects.toThrow(/already exists/);
	});

	it("rejects update that collides with another slot", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_sched_upd";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));

		await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "u1",
			tourId,
			date: "2026-08-01",
			startTime: "10:00",
			endTime: "12:00",
			capacityTotal: 10,
		});
		const second = await t.mutation(internal.tourSchedules.internalCreate, {
			organizationId: orgId,
			userId: "u1",
			tourId,
			date: "2026-08-01",
			startTime: "14:00",
			endTime: "16:00",
			capacityTotal: 10,
		});

		await expect(
			t.mutation(internal.tourSchedules.internalUpdate, {
				organizationId: orgId,
				userId: "u1",
				scheduleId: second,
				startTime: "10:00",
			}),
		).rejects.toThrow(/already exists/);
	});
});
