// F-new-unlinked-booking-capacity-release — follow-up (2026-10-04):
// "explicit-path retroactive link still drains".
//
// The c8fc7de guard only covered the scheduleId-absent fallback path. A
// booking whose scheduleId was edited afterwards WITHOUT a paired
// increment (manual repair, backfill) still drained that schedule on
// cancel/expiry, because release followed the mutable scheduleId pointer
// instead of the capacity the booking actually claimed.
//
// A capacity claim is the only thing a release may undo, so release now
// targets `capacityClaimedScheduleId`, written only by a paired
// increment. A timestamp heuristic was rejected (the finding's own
// reasoning): legitimate moves postdate the booking, so creation order
// cannot tell a real claim from a retroactively-patched pointer.
//
// Scope, stated honestly: this makes the claim authoritative for rows
// written from now on, and the backfill stamps legacy rows with their
// best available evidence. A legacy row already patched before the
// backfill is not recoverable from data alone — see backfills.ts.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedBooking, seedCustomer, seedSchedule, seedTour } from "./helpers";
import { internal } from "../_generated/api";
import {
	performCancel,
	performUpdate,
} from "../lib/bookingsLifecycle";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";
const DATE = "2027-03-15";
const DATE_2 = "2027-03-16";

type T = ReturnType<typeof convexTest>;

/** A booking holding `guests` seats on `scheduleId`, with a real claim. */
async function seedClaimed(
	t: T,
	opts: { guests?: number; capacityBooked?: number; capacityTotal?: number },
) {
	return t.run(async (ctx) => {
		const tourId = await seedTour(ctx, { orgId: ORG, maxGuests: 15 });
		const customerId = await seedCustomer(ctx, { orgId: ORG });
		const scheduleId = await seedSchedule(ctx, {
			orgId: ORG,
			tourId,
			date: DATE,
			startTime: "09:00",
			capacityTotal: opts.capacityTotal ?? 20,
			capacityBooked: opts.capacityBooked ?? 2,
		});
		const bookingId = await seedBooking(ctx, {
			orgId: ORG,
			tourId,
			customerId,
			date: DATE,
			startTime: "09:00",
			guests: opts.guests ?? 2,
			status: "confirmed",
		});
		// The paired write every increment path now performs.
		await ctx.db.patch(bookingId, { scheduleId, capacityClaimedScheduleId: scheduleId });
		return { tourId, customerId, scheduleId, bookingId };
	});
}

describe("capacity claim — release follows the claim, not the scheduleId pointer", () => {
	// The finding's own scenario. A holds our 2 seats. Someone repairs the
	// row by hand and points scheduleId at B, which holds 5 other
	// bookings' seats. Cancel must give A its 2 seats back and leave B
	// completely alone — before the fix it released B, handing five seats
	// to the open market that were never ours.
	it("a retroactive scheduleId patch does not redirect the release", async () => {
		const t = convexTest(schema, modules);
		const w = await seedClaimed(t, { guests: 2, capacityBooked: 2 });
		const otherScheduleId = await t.run(async (ctx) => {
			const id = await seedSchedule(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: DATE_2,
				startTime: "14:00",
				capacityTotal: 20,
				capacityBooked: 5,
			});
			// Manual repair / backfill: pointer moved, no increment.
			await ctx.db.patch(w.bookingId, { scheduleId: id });
			return id;
		});

		await t.run(async (ctx) => {
			const booking = (await ctx.db.get(w.bookingId))!;
			await performCancel(ctx, booking, undefined, "user_1");
		});

		const claimed = await t.run((ctx) => ctx.db.get(w.scheduleId));
		const other = await t.run((ctx) => ctx.db.get(otherScheduleId));
		expect(claimed?.capacityBooked).toBe(0);
		expect(other?.capacityBooked).toBe(5);
	});

	it("a claim-bearing booking created through internalCreate releases on cancel", async () => {
		const t = convexTest(schema, modules);
		const { scheduleId, bookingId } = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG, maxGuests: 15 });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: DATE,
				startTime: "09:00",
				capacityTotal: 10,
				capacityBooked: 0,
			});
			return { tourId, scheduleId, bookingId: null as never };
		});
		const tourId = await t.run(async (ctx) => {
			const tour = await ctx.db.query("tours").first();
			return tour!._id;
		});

		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: ORG,
			tourId,
			scheduleId,
			customerName: "Claim Guest",
			customerEmail: "claim@example.com",
			date: DATE,
			startTime: "09:00",
			guests: 2,
		});

		const created = await t.run(async (ctx) => {
			const row = await ctx.db.query("bookings").first();
			return row!;
		});
		// The create path records the claim as part of the same mutation
		// as the increment.
		expect(created.capacityClaimedScheduleId).toBe(scheduleId);
		expect((await t.run((ctx) => ctx.db.get(scheduleId)))?.capacityBooked).toBe(2);

		await t.run(async (ctx) => {
			await performCancel(ctx, created, undefined, "user_1");
		});
		expect((await t.run((ctx) => ctx.db.get(scheduleId)))?.capacityBooked).toBe(0);
		void bookingId;
	});
});

describe("capacity claim — a move carries it, a free-time move clears it", () => {
	it("moves the claim to the new schedule so cancel releases the new one", async () => {
		const t = convexTest(schema, modules);
		const w = await seedClaimed(t, { guests: 2, capacityBooked: 2 });
		const targetId = await t.run(async (ctx) =>
			seedSchedule(ctx, {
				orgId: ORG,
				tourId: w.tourId,
				date: DATE_2,
				startTime: "14:00",
				capacityTotal: 20,
				capacityBooked: 0,
			}),
		);

		await t.run(async (ctx) => {
			const booking = (await ctx.db.get(w.bookingId))!;
			await performUpdate(ctx, booking, ORG, "user_1", {
				bookingId: w.bookingId,
				date: DATE_2,
				startTime: "14:00",
			});
		});

		const moved = await t.run((ctx) => ctx.db.get(w.bookingId));
		expect(moved?.capacityClaimedScheduleId).toBe(targetId);
		// The move already gave A its seats back.
		expect((await t.run((ctx) => ctx.db.get(w.scheduleId)))?.capacityBooked).toBe(0);
		expect((await t.run((ctx) => ctx.db.get(targetId)))?.capacityBooked).toBe(2);

		await t.run(async (ctx) => {
			const booking = (await ctx.db.get(w.bookingId))!;
			await performCancel(ctx, booking, undefined, "user_1");
		});

		// B releases once. A must NOT be touched a second time — that
		// double release is the leak the cleared claim prevents.
		expect((await t.run((ctx) => ctx.db.get(targetId)))?.capacityBooked).toBe(0);
		expect((await t.run((ctx) => ctx.db.get(w.scheduleId)))?.capacityBooked).toBe(0);
	});

	it("clears the claim when the booking moves onto a free-time request", async () => {
		const t = convexTest(schema, modules);
		const w = await seedClaimed(t, { guests: 2, capacityBooked: 2 });

		// DATE_2 has no schedule, so the move resolves to no target.
		await t.run(async (ctx) => {
			const booking = (await ctx.db.get(w.bookingId))!;
			await performUpdate(ctx, booking, ORG, "user_1", {
				bookingId: w.bookingId,
				date: DATE_2,
				startTime: "14:00",
			});
		});

		const moved = await t.run((ctx) => ctx.db.get(w.bookingId));
		expect(moved?.capacityClaimedScheduleId).toBeUndefined();
		// The move released A's seats exactly once.
		expect((await t.run((ctx) => ctx.db.get(w.scheduleId)))?.capacityBooked).toBe(0);

		await t.run(async (ctx) => {
			const booking = (await ctx.db.get(w.bookingId))!;
			await performCancel(ctx, booking, undefined, "user_1");
		});

		// Cancelling the now-unclaimed free-time request must not release
		// A a second time.
		expect((await t.run((ctx) => ctx.db.get(w.scheduleId)))?.capacityBooked).toBe(0);
	});
});

describe("backfills.claimLinkedBookings — stamps legacy rows, idempotent", () => {
	it("stamps a legacy linked row once and is a no-op on re-run", async () => {
		const t = convexTest(schema, modules);
		const w = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG, maxGuests: 15 });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const scheduleId = await seedSchedule(ctx, {
				orgId: ORG,
				tourId,
				date: DATE,
				startTime: "09:00",
				capacityTotal: 10,
				capacityBooked: 2,
			});
			// Legacy shape: linked, but written before the claim existed.
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: DATE,
				startTime: "09:00",
				guests: 2,
				status: "confirmed",
			});
			await ctx.db.patch(bookingId, { scheduleId });
			return { scheduleId, bookingId };
		});

		const first = await t.mutation(internal.backfills.claimLinkedBookings, {});
		expect(first.stamped).toBe(1);
		expect(
			(await t.run((ctx) => ctx.db.get(w.bookingId)))?.capacityClaimedScheduleId,
		).toBe(w.scheduleId);

		// Idempotent: a second pass has nothing left to stamp.
		const second = await t.mutation(internal.backfills.claimLinkedBookings, {});
		expect(second.stamped).toBe(0);
	});

	it("leaves an unlinked booking unclaimed", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG, maxGuests: 15 });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: DATE,
				startTime: "09:00",
				guests: 2,
				status: "confirmed",
			});
		});
		// A free-time request never claimed a schedule, so the backfill
		// must not invent one.
		const res = await t.mutation(internal.backfills.claimLinkedBookings, {});
		expect(res.stamped).toBe(0);
	});
});
