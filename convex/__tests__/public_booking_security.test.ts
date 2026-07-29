// Security edge-case tests for the public booking flow.
//
// public_booking.test.ts covers the happy path and the basic
// validation guards (inactive tour, past date, blackout, over
// maxGuests, guests <= 0, cross-org tour, overlong email). This
// file pins the security edge cases that are NOT already covered
// there:
//
//   1. Orphaned booking compensation — when incrementBooked throws
//      (over capacity), no orphaned "pending" booking may be left
//      behind. The internalCreate mutation inserts the booking as
//      "pending" before calling incrementBooked; if that throws, a
//      compensating internalCancel fires and the mutation re-throws,
//      rolling back the entire transaction. The security property
//      we pin: after a failed over-capacity attempt, no second
//      "pending" booking exists and the schedule capacity is
//      unchanged.
//   2. Malformed email shape — a genuinely invalid email (no TLD,
//      no @, etc.) must be rejected, not just an overlong one.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";
import { seedSchedule, seedTour as sharedSeedTour } from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

process.env.ENCRYPTION_KEY ??= "a".repeat(64);

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

// Local wrapper that preserves the positional signature
// `(ctx, orgId, maxGuests, isActive)` used throughout the
// public_booking test files. The underlying `seedTour` lives in
// convex/__tests__/helpers.ts and is the single source of truth.
async function seedTour(
	ctx: TestCtx,
	orgId: string,
	maxGuests = 15,
	isActive = true,
): Promise<Id<"tours">> {
	return await sharedSeedTour(
		ctx as unknown as Parameters<typeof sharedSeedTour>[0],
		{ orgId, maxGuests, isActive, name: "Old Town Walk" },
	);
}

describe("convex/public_booking — security edge cases", () => {
	it("leaves no orphaned pending booking when incrementBooked throws (over capacity)", async () => {
		// When a schedule is at capacity and a second booking attempt
		// triggers incrementBooked to throw "over capacity", the
		// compensating internalCancel fires and the mutation re-throws,
		// rolling back the entire transaction. The security property
		// we pin: after the failed attempt, no orphaned "pending"
		// booking exists for the second customer, the first booking
		// is untouched, and the schedule capacity is unchanged.
		const t = convexTest(schema, modules);
		const orgId = "org_sec_orphan";
		const date = "2027-08-15";
		const startTime = "10:00";

		const { tourId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c, orgId, 20);
			// Schedule with capacity 1 — one guest fills it.
			const scheduleId = await seedSchedule(c, {
				orgId,
				tourId,
				date,
				startTime,
				capacityTotal: 1,
				capacityBooked: 0,
			});
			return { tourId, scheduleId };
		});

		// First booking: 1 guest — fills the schedule.
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId,
			scheduleId,
			customerName: "First Guest",
			customerEmail: "first@example.com",
			date,
			startTime,
			guests: 1,
		});

		// Second booking: 1 more guest — over capacity (1 + 1 > 1).
		// Must throw.
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				scheduleId,
				customerName: "Second Guest",
				customerEmail: "second@example.com",
				date,
				startTime,
				guests: 1,
			}),
		).rejects.toThrow(/over capacity/i);

		// No orphaned "pending" booking for the second customer.
		// The transaction rolled back, so neither the customer nor
		// the booking should exist.
		const allBookings = await t.run(async (ctx) =>
			ctx.db.query("bookings").collect(),
		);
		const allCustomers = await t.run(async (ctx) =>
			ctx.db.query("customers").collect(),
		);

		// Only the first booking should exist, still "pending".
		expect(allBookings.length).toBe(1);
		expect(allBookings[0]?.status).toBe("pending");

		// No customer row for the second email.
		expect(
			allCustomers.some(
				(c: { email: string }) => c.email === "second@example.com",
			),
		).toBe(false);

		// The schedule's capacityBooked must still be 1 (the second
		// increment was rejected, so it must not have stuck).
		const schedule = await t.run(async (ctx) =>
			ctx.db.get(scheduleId),
		);
		expect(schedule?.capacityBooked).toBe(1);
	});

	it("rejects a malformed email (no TLD / no @)", async () => {
		// The existing overlong-email test covers the >254 char path.
		// This pins the EMAIL_REGEX shape check: an email with no
		// TLD (or no @) must be rejected before it reaches the
		// customers table.
		const t = convexTest(schema, modules);
		const orgId = "org_sec_bademail";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "Bad Email",
				customerEmail: "not-an-email",
				date: "2027-08-16",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/Invalid email address/);

		// No customer row should have been created for the bad email.
		const customers = await t.run(async (ctx) =>
			ctx.db.query("customers").collect(),
		);
		expect(
			customers.some(
				(c: { email: string }) => c.email === "not-an-email",
			),
		).toBe(false);
	});

	it("rejects an email with no domain TLD", async () => {
		// "foo@bar" passes the "@" check but fails the "\.[^\s@]{2,}"
		// TLD portion of EMAIL_REGEX. Defense in depth: the FE
		// validates too, but the public endpoint is reachable by
		// anyone.
		const t = convexTest(schema, modules);
		const orgId = "org_sec_notld";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId,
				customerName: "No TLD",
				customerEmail: "foo@bar",
				date: "2027-08-17",
				startTime: "10:00",
				guests: 1,
			}),
		).rejects.toThrow(/Invalid email address/);
	});
});
