// GT-AUDIT-03 — the 15-minute pending-expiry cron destroys PAID bookings.
//
// `applyPaymentToBooking` (payments.ts) reduces `balanceDueCents` but never
// leaves `status: "pending"`. `expireStalePending` filtered on status and age
// only, so a booking a guest had paid for in full was swept 15 minutes later:
// seats released and resold, and the row became unconfirmable.
//
// The guard belongs at `internalExpire` — the chokepoint every expiry path
// goes through — rather than in the cron's scan filter, so it holds however
// the row is reached.
//
// Deliberately scoped to the PAID invariant only. Whether a public booking
// request should expire unattended at all is a product decision (public_booking
// creates them pending for operator confirmation); that half is left open and
// is not simulated here.

import { convexTest } from "convex-test";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { seedBooking, seedCustomer, seedSchedule, seedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const ORG = "org_test";

type TestCtx = Parameters<typeof seedTour>[0];
type TClient = ReturnType<typeof convexTest>;

/** A pending booking older than the 15-minute cutoff, holding 2 seats. */
async function stalePending(t: TClient) {
	return t.run(async (ctx) => {
		const c = ctx as unknown as TestCtx;
		const tourId = await seedTour(c, { orgId: ORG });
		const customerId = await seedCustomer(c, { orgId: ORG });
		const scheduleId = await seedSchedule(c, { orgId: ORG, tourId });
		const bookingId = await seedBooking(c, {
			orgId: ORG,
			tourId,
			customerId,
			status: "pending",
			guests: 2,
		});
		// The shared helper takes neither createdAt nor scheduleId.
		await c.db.patch(bookingId, { createdAt: 0, scheduleId });
		return { bookingId, scheduleId };
	});
}

async function addPayment(
	t: TClient,
	bookingId: Id<"bookings">,
	status: string,
) {
	await t.run(async (ctx) => {
		await (ctx as unknown as TestCtx).db.insert("payments", {
			organizationId: ORG,
			bookingId,
			amountCents: 10000n,
			currency: "EUR",
			status,
			provider: "stripe",
			createdAt: 0,
			updatedAt: 0,
		});
	});
}

describe("GT-AUDIT-03 — a paid booking is never expired unattended", () => {
	it("leaves a fully paid pending booking alone and keeps its seats", async () => {
		const t = convexTest(schema, modules);
		const { bookingId, scheduleId } = await stalePending(t);
		await addPayment(t, bookingId, "SUCCEEDED");
		const before = await t.run(async (ctx) =>
			(ctx.db.get(scheduleId) as Promise<{ capacityBooked: number } | null>),
		).then((r) => r?.capacityBooked);

		const result = await t.mutation(internal.bookings.expireStalePending, {});

		// Scanned but not expired: the row stays visible in the count so a
		// backlog of paid-but-pending rows does not hide behind a silent skip.
		expect(result.scanned).toBe(1);
		expect(result.expired).toBe(0);

		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("pending");
		// Compared against its own pre-sweep value, not a literal: the shared
		// schedule seeder does not book capacity, and the point is only that
		// performExpire — the thing that releases seats — never ran.
		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(before);
	});

	it("still expires an unpaid pending booking", async () => {
		const t = convexTest(schema, modules);
		const { bookingId, scheduleId } = await stalePending(t);

		const result = await t.mutation(internal.bookings.expireStalePending, {});

		expect(result).toEqual({ scanned: 1, expired: 1, keptPaid: 0 });
		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("expired");
		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(0);
	});

	it("does not treat a FAILED payment as paid", async () => {
		const t = convexTest(schema, modules);
		const { bookingId } = await stalePending(t);
		await addPayment(t, bookingId, "FAILED");

		const result = await t.mutation(internal.bookings.expireStalePending, {});
		expect(result.expired).toBe(1);
	});

	it("internalExpire alone refuses a paid booking", async () => {
		// The guard must live at the chokepoint, not only in the cron filter,
		// so a direct internalExpire cannot sweep a paid row either.
		const t = convexTest(schema, modules);
		const { bookingId } = await stalePending(t);
		await addPayment(t, bookingId, "SUCCEEDED");

		await t.mutation(internal.bookings.internalExpire, { bookingId });

		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("pending");
	});
});