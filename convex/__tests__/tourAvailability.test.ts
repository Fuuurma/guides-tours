// Tests for the denormalized availability projection
// (DST-guides-tours-03): one tourAvailability doc per (tour, date),
// rebuilt inside the SAME mutation as every capacity/schedule write —
// the projection must never drift from tourSchedules.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
	seedCustomer,
	seedBooking,
	seedSchedule,
	seedTour,
	type TestCtx,
} from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_avail";
const DATE = "2026-12-01";

async function getProjection(
	ctx: { db: TestCtx["db"] },
	tourId: Id<"tours">,
	date = DATE,
): Promise<Doc<"tourAvailability"> | null> {
	return await ctx.db
		.query("tourAvailability")
		.withIndex("by_tour_date", (q) =>
			q.eq("tourId", tourId).eq("date", date),
		)
		.unique();
}

async function seedTourAndSchedule(
	ctx: TestCtx,
	capacityTotal = 10,
): Promise<{ tourId: Id<"tours">; scheduleId: Id<"tourSchedules"> }> {
	const tourId = await seedTour(ctx, { orgId: ORG });
	// Direct insert bypasses the mutation — the projection is only
	// written by the real mutation paths, which is what we're testing.
	const scheduleId = await seedSchedule(ctx, {
		orgId: ORG,
		tourId,
		date: DATE,
		startTime: "09:00",
		endTime: "11:00",
		capacityTotal,
	});
	return { tourId, scheduleId };
}

describe("convex/tourAvailability — projection sync", () => {
	it("incrementBooked creates the doc and claims seats; decrementBooked releases them", async () => {
		const t = convexTest(schema, modules);
		const { tourId, scheduleId } = await t.run(async (ctx) =>
			seedTourAndSchedule(ctx as unknown as TestCtx),
		);

		// No projection yet — the seed bypassed the mutations.
		expect(
			await t.run(async (ctx) => getProjection(ctx, tourId)),
		).toBeNull();

		await t.mutation(internal.tourSchedules.incrementBooked, {
			organizationId: ORG,
			scheduleId,
			guests: 4,
		});

		const afterBook = await t.run(async (ctx) => getProjection(ctx, tourId));
		expect(afterBook?.slots).toHaveLength(1);
		expect(afterBook?.slots[0]).toMatchObject({
			scheduleId,
			startTime: "09:00",
			capacityTotal: 10,
			capacityBooked: 4,
			seatsLeft: 6,
			status: "available",
		});

		await t.mutation(internal.tourSchedules.decrementBooked, {
			organizationId: ORG,
			scheduleId,
			guests: 4,
		});
		const afterCancel = await t.run(async (ctx) =>
			getProjection(ctx, tourId),
		);
		expect(afterCancel?.slots[0]).toMatchObject({
			capacityBooked: 0,
			seatsLeft: 10,
		});
	});

	it("public booking (internalCreate) claims capacity and updates the projection in the same mutation", async () => {
		const t = convexTest(schema, modules);
		const { tourId, scheduleId } = await t.run(async (ctx) =>
			seedTourAndSchedule(ctx as unknown as TestCtx),
		);

		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: ORG,
			tourId,
			scheduleId,
			customerName: "Pub Alice",
			customerEmail: "pub-alice@example.com",
			date: DATE,
			startTime: "09:00",
			guests: 3,
		});

		const proj = await t.run(async (ctx) => getProjection(ctx, tourId));
		expect(proj?.slots[0]).toMatchObject({
			capacityBooked: 3,
			seatsLeft: 7,
		});
	});

	it("cancel releases seats in the projection through performCancel", async () => {
		const t = convexTest(schema, modules);
		const { tourId, scheduleId, bookingId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const { tourId, scheduleId } = await seedTourAndSchedule(c);
			const customerId = await seedCustomer(c, { orgId: ORG });
			const bookingId = await seedBooking(c, {
				orgId: ORG,
				tourId,
				customerId,
				date: DATE,
				startTime: "09:00",
				guests: 2,
				status: "confirmed",
			});
			return { tourId, scheduleId, bookingId };
		});
		// Attach the schedule link + mark the seats as held.
		await t.run(async (ctx) => {
			await ctx.db.patch(bookingId, { scheduleId });
			await ctx.db.patch(scheduleId, { capacityBooked: 2 });
		});
		// Cancel → performCancel → releaseBookingCapacity →
		// decrementBooked, which must sync the projection.
		await t.mutation(internal.bookings.internalCancel, {
			bookingId,
			reason: "test",
		});

		const proj = await t.run(async (ctx) => getProjection(ctx, tourId));
		expect(proj?.slots[0]).toMatchObject({
			capacityBooked: 0,
			seatsLeft: 10,
		});
	});

	it("schedule create/remove and date moves keep the projection in sync", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, { orgId: ORG }),
		);

		const scheduleId = await t.mutation(
			internal.tourSchedules.internalCreate,
			{
				organizationId: ORG,
				userId: "op",
				tourId,
				date: DATE,
				startTime: "09:00",
				endTime: "11:00",
				capacityTotal: 8,
			},
		);
		let proj = await t.run(async (ctx) => getProjection(ctx, tourId));
		expect(proj?.slots[0]).toMatchObject({
			scheduleId,
			capacityTotal: 8,
			seatsLeft: 8,
		});

		// Move the slot to another day: old date's doc is removed,
		// new date's doc gains the slot.
		await t.mutation(internal.tourSchedules.internalUpdate, {
			organizationId: ORG,
			userId: "op",
			scheduleId,
			date: "2026-12-02",
		});
		expect(
			await t.run(async (ctx) => getProjection(ctx, tourId, DATE)),
		).toBeNull();
		proj = await t.run(async (ctx) => getProjection(ctx, tourId, "2026-12-02"));
		expect(proj?.slots[0]?.scheduleId).toBe(scheduleId);

		await t.mutation(internal.tourSchedules.internalRemove, {
			organizationId: ORG,
			userId: "op",
			scheduleId,
		});
		expect(
			await t.run(async (ctx) => getProjection(ctx, tourId, "2026-12-02")),
		).toBeNull();
	});

	it("backfillAvailability rebuilds docs for schedules that predate the projection", async () => {
		const t = convexTest(schema, modules);
		const { tourId } = await t.run(async (ctx) =>
			seedTourAndSchedule(ctx as unknown as TestCtx, 6),
		);

		const result = await t.mutation(
			internal.tourSchedules.backfillAvailability,
			{ organizationId: ORG },
		);
		expect(result).toEqual({ scanned: 1, synced: 1 });

		const proj = await t.run(async (ctx) => getProjection(ctx, tourId));
		expect(proj?.slots[0]).toMatchObject({
			capacityTotal: 6,
			seatsLeft: 6,
			status: "available",
		});
	});
});
