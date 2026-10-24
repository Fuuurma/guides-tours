import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

async function seedTour(
	ctx: TestCtx,
	orgId: string,
): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Harbor Walk",
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

describe("ops.internalStaffDeparture", () => {
	it("publishes a departure and assigns a guide in one call", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_staff";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		const result = await t.mutation(internal.ops.internalStaffDeparture, {
			organizationId: orgId,
			userId: "owner-1",
			tourId,
			date: "2026-09-01",
			startTime: "10:00",
			endTime: "12:00",
			capacityTotal: 8,
			publish: true,
			guideId: "guide-1",
		});

		expect(result.scheduleId).toBeTruthy();
		expect(result.assignmentId).toBeTruthy();

		const schedule = await t.run(async (ctx) => {
			const row = await ctx.db.get(result.scheduleId!);
			return row;
		});
		expect(schedule?.date).toBe("2026-09-01");
		expect(schedule?.startTime).toBe("10:00");
		expect(schedule?.capacityTotal).toBe(8);

		const assignment = await t.run(async (ctx) => {
			const row = await ctx.db.get(result.assignmentId!);
			return row;
		});
		expect(assignment?.guideId).toBe("guide-1");
		expect(assignment?.scheduleId).toBe(result.scheduleId);
	});

	it("reuses an existing schedule instead of duplicating the slot", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_reuse";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const existingId = await t.mutation(
			internal.tourSchedules.internalCreate,
			{
				organizationId: orgId,
				userId: "owner-1",
				tourId,
				date: "2026-09-02",
				startTime: "14:00",
				endTime: "16:00",
				capacityTotal: 6,
			},
		);

		const result = await t.mutation(internal.ops.internalStaffDeparture, {
			organizationId: orgId,
			userId: "owner-1",
			tourId,
			date: "2026-09-02",
			startTime: "14:00",
			endTime: "16:00",
			capacityTotal: 6,
			publish: true,
			guideId: "guide-2",
		});

		expect(result.scheduleId).toBe(existingId);
		expect(result.assignmentId).toBeTruthy();
	});

	// F876 — the resolver used .take(20) + find, so after 21+ rows in the
	// same (tour, date, startTime) partition the 20 oldest are all
	// cancelled debris from cancel/re-create cycles, the find missed the
	// one live schedule, and the mutation published ANOTHER live dupe.
	// The resolver must drain the partition, not sample its head.
	it("finds the live schedule beyond the 20 oldest cancelled rows (F876)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_deep_partition";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		// 20 cancelled debris rows first (the take(20) head), then the
		// one live schedule the resolver must still find. All inserted
		// directly: assertScheduleSlotFree's .unique() cannot create in a
		// partition that already holds rows, which is exactly the crash
		// the defect-path falls into past the blind spot.
		const liveId = await t.run(async (ctx) => {
			for (let i = 0; i < 20; i++) {
				await ctx.db.insert("tourSchedules", {
					organizationId: orgId,
					tourId,
					date: "2026-09-05",
					startTime: "11:00",
					endTime: "13:00",
					capacityTotal: 6,
					capacityBooked: 0,
					status: "cancelled",
					notes: "",
					createdAt: i,
					updatedAt: i,
				});
			}
			return ctx.db.insert("tourSchedules", {
				organizationId: orgId,
				tourId,
				date: "2026-09-05",
				startTime: "11:00",
				endTime: "13:00",
				capacityTotal: 6,
				capacityBooked: 0,
				status: "available",
				notes: "",
				createdAt: 20,
				updatedAt: 20,
			});
		});

		const result = await t.mutation(internal.ops.internalStaffDeparture, {
			organizationId: orgId,
			userId: "owner-1",
			tourId,
			date: "2026-09-05",
			startTime: "11:00",
			endTime: "13:00",
			capacityTotal: 6,
			publish: true,
			guideId: "guide-deep",
		});

		// The live schedule is reused, not duplicated.
		expect(result.scheduleId).toBe(liveId);
		const liveCount = await t.run(async (ctx) => {
			const rows = await ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date_start", (q) =>
					q
						.eq("tourId", tourId)
						.eq("date", "2026-09-05")
						.eq("startTime", "11:00"),
				)
				.collect();
			return rows.filter((s) => s.status !== "cancelled").length;
		});
		expect(liveCount).toBe(1);
	});

	it("can assign without publishing a departure", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_assign_only";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		const result = await t.mutation(internal.ops.internalStaffDeparture, {
			organizationId: orgId,
			userId: "owner-1",
			tourId,
			date: "2026-09-03",
			startTime: "09:00",
			publish: false,
			guideId: "guide-3",
		});

		expect(result.scheduleId).toBeNull();
		expect(result.assignmentId).toBeTruthy();
	});

	it("can publish without assigning a guide", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_publish_only";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		const result = await t.mutation(internal.ops.internalStaffDeparture, {
			organizationId: orgId,
			userId: "owner-1",
			tourId,
			date: "2026-09-04",
			startTime: "11:00",
			endTime: "13:00",
			capacityTotal: 10,
			publish: true,
		});

		expect(result.scheduleId).toBeTruthy();
		expect(result.assignmentId).toBeNull();
	});

	it("rejects when neither publishing nor assigning", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_empty";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);

		await expect(
			t.mutation(internal.ops.internalStaffDeparture, {
				organizationId: orgId,
				userId: "owner-1",
				tourId,
				date: "2026-09-05",
				startTime: "10:00",
				publish: false,
			}),
		).rejects.toThrow(/Nothing to create/);
	});
});
