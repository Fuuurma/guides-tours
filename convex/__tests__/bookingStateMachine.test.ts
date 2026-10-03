// Tests for the booking state machine additions (DST-guides-tours-04):
//   pending → expired via the stale-pending cron path
//   confirmed → no_show via markNoShow
//   expiry releases capacity through the SAME decrementBooked
//   path as a manual cancel.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel>;

const ORG = "org_a";

async function seedTour(ctx: TestCtx): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: ORG,
		name: "Old Town Walk",
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
		tourType: "walkable",
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

async function seedCustomer(ctx: TestCtx): Promise<Id<"customers">> {
	return await ctx.db.insert("customers", {
		organizationId: ORG,
		name: "Alice",
		email: "alice@example.com",
		phone: "",
		notes: "",
		smsConsent: false,
		emailConsent: true,
		preferredLanguage: "en",
		tags: [],
		source: "",
		sourceDetails: "",
		specialRequirements: "",
		vipStatus: false,
		loyaltyPoints: 0,
		totalVisits: 0,
		totalRevenueCents: 0n,
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedSchedule(
	ctx: TestCtx,
	tourId: Id<"tours">,
	capacityBooked = 0,
): Promise<Id<"tourSchedules">> {
	return await ctx.db.insert("tourSchedules", {
		organizationId: ORG,
		tourId,
		date: "2026-12-01",
		startTime: "09:00",
		endTime: "11:00",
		capacityTotal: 10,
		capacityBooked,
		status: "available",
		notes: "",
		createdAt: 0,
		updatedAt: 0,
	});
}

async function seedBooking(
	ctx: TestCtx,
	ids: {
		tourId: Id<"tours">;
		customerId: Id<"customers">;
		scheduleId?: Id<"tourSchedules">;
	},
	overrides: Partial<{
		status:
			| "pending"
			| "confirmed"
			| "checked_in"
			| "completed"
			| "cancelled"
			| "expired"
			| "no_show";
		createdAt: number;
		guests: number;
		date: string;
		startTime: string;
	}> = {},
): Promise<Id<"bookings">> {
	return await ctx.db.insert("bookings", {
		organizationId: ORG,
		tourId: ids.tourId,
		scheduleId: ids.scheduleId,
		customerId: ids.customerId,
		date: overrides.date ?? "2026-12-01",
		startTime: overrides.startTime ?? "09:00",
		guests: overrides.guests ?? 2,
		guestNames: "",
		languageRequired: "",
		notes: "",
		status: overrides.status ?? "pending",
		depositAmountCents: 0n,
		totalAmountCents: 10000n,
		balanceDueCents: 10000n,
		paymentMethod: "",
		checkedInBy: "",
		netRevenueCents: 10000n,
		source: "direct",
		reviewComment: "",
		createdAt: overrides.createdAt ?? 0,
		updatedAt: 0,
	});
}

describe("convex/bookings — pending expiry (state machine)", () => {
	it("expires a stale pending booking and releases its held capacity via decrementBooked", async () => {
		const t = convexTest(schema, modules);
		const { bookingId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			const scheduleId = await seedSchedule(c, tourId, 2);
			const bookingId = await seedBooking(
				c,
				{ tourId, customerId, scheduleId },
				// createdAt 0 is far older than the 15m cutoff.
				{ status: "pending", createdAt: 0, guests: 2 },
			);
			return { bookingId, scheduleId };
		});

		const result = await t.mutation(
			internal.bookings.expireStalePending,
			{},
		);
		expect(result).toEqual({ scanned: 1, expired: 1 });

		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("expired");

		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(0);
	});

	it("leaves fresh pending bookings alone", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			return await seedBooking(
				c,
				{ tourId, customerId },
				{ status: "pending", createdAt: Date.now() },
			);
		});

		const result = await t.mutation(
			internal.bookings.expireStalePending,
			{},
		);
		expect(result).toEqual({ scanned: 0, expired: 0 });
		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("pending");
	});

	it("internalExpire skips a booking confirmed between scan and expire", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			return await seedBooking(
				c,
				{ tourId, customerId },
				{ status: "confirmed", createdAt: 0 },
			);
		});
		await t.mutation(internal.bookings.internalExpire, { bookingId });
		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("confirmed");
	});

	it("expired bookings are terminal: cancel and complete refuse", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			return await seedBooking(
				c,
				{ tourId, customerId },
				{ status: "expired" },
			);
		});
		await expect(
			t.mutation(internal.bookings.internalCancel, { bookingId }),
		).rejects.toThrow(/expired/);
		await expect(
			t.mutation(internal.bookings.internalComplete, { bookingId }),
		).rejects.toThrow(/expired/);
	});
});

describe("convex/bookings — no_show transition", () => {
	it("confirmed → no_show keeps capacity booked", async () => {
		const t = convexTest(schema, modules);
		const { bookingId, scheduleId } = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			const scheduleId = await seedSchedule(c, tourId, 2);
			const bookingId = await seedBooking(
				c,
				{ tourId, customerId, scheduleId },
				{ status: "confirmed", guests: 2 },
			);
			return { bookingId, scheduleId };
		});

		await t.mutation(internal.bookings.internalNoShow, { bookingId });
		const booking = await t.run(async (ctx) => ctx.db.get(bookingId));
		expect(booking?.status).toBe("no_show");

		// The seat was consumed — no capacity release.
		const schedule = await t.run(async (ctx) => ctx.db.get(scheduleId));
		expect(schedule?.capacityBooked).toBe(2);
	});

	it("rejects no_show from non-confirmed states", async () => {
		const t = convexTest(schema, modules);
		const bookingId = await t.run(async (ctx) => {
			const c = ctx as unknown as TestCtx;
			const tourId = await seedTour(c);
			const customerId = await seedCustomer(c);
			return await seedBooking(
				c,
				{ tourId, customerId },
				{ status: "pending" },
			);
		});
		await expect(
			t.mutation(internal.bookings.internalNoShow, { bookingId }),
		).rejects.toThrow(/Only confirmed/);
	});
});
