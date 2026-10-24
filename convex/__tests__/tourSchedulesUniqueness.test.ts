import { type TestConvex, convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import schema from "../schema";
import { seedSchedule } from "./helpers";

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

/** YYYY-MM-DD for `now + offsetDays` — a date far enough ahead that the
 *  public path's booking-cutoff window does not reject the fixture. */
function futureDate(offsetDays: number): string {
	return new Date(Date.now() + offsetDays * 24 * 3_600_000)
		.toISOString()
		.slice(0, 10);
}

/**
 * Seeds the cancel/re-create shape documented at convex/ops.ts: one
 * cancelled schedule plus one live schedule for the SAME
 * (tourId, date, startTime). The rows are inserted directly — no
 * mutation can create the second one, which is the whole point.
 */
async function seedDuplicateSlot(
	t: TestConvex<typeof schema>,
	orgId: string,
	tourId: Id<"tours">,
	date: string,
	startTime: string,
): Promise<void> {
	await t.run(async (ctx) => {
		const cancelled = await seedSchedule(ctx, {
			orgId,
			tourId,
			date,
			startTime,
		});
		await ctx.db.patch(cancelled, { status: "cancelled" });
		await seedSchedule(ctx, { orgId, tourId, date, startTime });
	});
}

/**
 * The message of the error a rejected mutation threw: the authored
 * ConvexError text when the check refused the slot, or Convex's opaque
 * engine error when it crashed instead.
 */
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
	let caught: unknown;
	try {
		await promise;
	} catch (err) {
		caught = err;
	}
	if (caught === undefined) {
		throw new Error("expected the mutation to reject");
	}
	return caught instanceof Error ? caught.message : String(caught);
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

	// F694 — a cancel/re-create cycle leaves TWO schedules in the same
	// (tourId, date, startTime) partition (documented at convex/ops.ts).
	// The uniqueness check read that partition with .unique(), which threw
	// Convex's opaque "unique() query returned more than one result" error:
	// the friendly refusal authored right below it was unreachable, and on
	// the public path a guest's booking attempt died with an internal
	// failure. take(2) + a length check must refuse the slot instead.
	describe("F694 — a slot that already holds two schedules", () => {
		it("refuses a create with the friendly error (F694)", async () => {
			const t = convexTest(schema, modules);
			const orgId = "org_sched_dupe";
			const tourId = await t.run((ctx) => seedTour(ctx, orgId));
			await seedDuplicateSlot(t, orgId, tourId, "2026-08-01", "10:00");

			const message = await rejectionMessage(
				t.mutation(internal.tourSchedules.internalCreate, {
					organizationId: orgId,
					userId: "u1",
					tourId,
					date: "2026-08-01",
					startTime: "10:00",
					endTime: "12:00",
					capacityTotal: 10,
				}),
			);

			expect(message).toMatch(
				/already exists for this tour on 2026-08-01 at 10:00/,
			);
			expect(message).not.toMatch(/unique\(\) query returned more than one result/);
		});

		it("refuses a reschedule onto the duplicated slot with the friendly error (F694)", async () => {
			const t = convexTest(schema, modules);
			const orgId = "org_sched_dupe_resched";
			const tourId = await t.run((ctx) => seedTour(ctx, orgId));
			const movable = await t.run(async (ctx) =>
				seedSchedule(ctx, {
					orgId,
					tourId,
					date: "2026-08-01",
					startTime: "09:00",
				}),
			);
			await seedDuplicateSlot(t, orgId, tourId, "2026-08-02", "10:00");

			const message = await rejectionMessage(
				t.mutation(internal.tourSchedules.internalUpdate, {
					organizationId: orgId,
					userId: "u1",
					scheduleId: movable,
					date: "2026-08-02",
					startTime: "10:00",
				}),
			);

			expect(message).toMatch(
				/already exists for this tour on 2026-08-02 at 10:00/,
			);
			expect(message).not.toMatch(/unique\(\) query returned more than one result/);
		});

		it("refuses a public booking with the friendly error, not an internal failure (F694)", async () => {
			const t = convexTest(schema, modules);
			const orgId = "org_sched_dupe_public";
			const tourId = await t.run((ctx) => seedTour(ctx, orgId));
			const date = futureDate(30);
			await seedDuplicateSlot(t, orgId, tourId, date, "10:00");

			const message = await rejectionMessage(
				t.mutation(internal.public_booking.internalCreate, {
					organizationId: orgId,
					tourId,
					customerName: "Dup Guest",
					customerEmail: "dup-guest@example.com",
					date,
					startTime: "10:00",
					guests: 2,
				}),
			);

			expect(message).toMatch(
				/already exists for this tour on .* at 10:00/,
			);
			expect(message).not.toMatch(/unique\(\) query returned more than one result/);
		});
	});
});
