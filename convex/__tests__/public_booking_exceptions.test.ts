// F344/F346: exception dates must enforce live on the public booking
// paths like blackouts do — internalGenerate is additive-only and never
// retracts already-materialized tourSchedules, so without book-time
// enforcement a "removed" date stays bookable, a "modified" exception
// with a new startTime sells a second slot that splits capacity, and a
// capacityOverride is silently ignored. Sibling fix F346 blocks
// rescheduling a departure that already has bookings (linked bookings
// freeze their own date/startTime copies).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import {
	seedException,
	seedSchedule,
	seedTour as sharedSeedTour,
} from "./helpers";
import {
	registerBetterAuthMock,
	resetMockOrgs,
	seedMockOrg,
} from "../../test-utils/betterAuthMock";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel>;

async function seedTour(ctx: TestCtx, orgId: string): Promise<Id<"tours">> {
	return await sharedSeedTour(ctx, { orgId, name: "Old Town Walk" });
}

function futureDate(offsetDays: number): string {
	return new Date(Date.now() + offsetDays * 24 * 3_600_000)
		.toISOString()
		.slice(0, 10);
}

describe("public_booking — live exception enforcement (F344)", () => {
	beforeEach(() => {
		resetMockOrgs();
	});

	it("listAvailableSlots returns [] on a removed-exception date even with materialized schedules", async () => {
		const t = convexTest(schema, modules);
		registerBetterAuthMock(t);
		seedMockOrg({ id: "org_ex_a", slug: "alpha" });
		const date = futureDate(4);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, "org_ex_a");
			await seedSchedule(ctx, {
				orgId: "org_ex_a",
				tourId: id,
				date,
				startTime: "09:00",
			});
			await seedException(ctx, {
				orgId: "org_ex_a",
				tourId: id,
				date,
				exceptionType: "removed",
			});
			return id;
		});

		const slots = await t.query(api.public_booking.listAvailableSlots, {
			slug: "alpha",
			tourId,
			date,
		});
		expect(slots).toEqual([]);
	});

	it("listAvailableSlots shows only the exception's startTime and honors capacityOverride", async () => {
		const t = convexTest(schema, modules);
		registerBetterAuthMock(t);
		seedMockOrg({ id: "org_ex_b", slug: "beta" });
		const date = futureDate(4);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, "org_ex_b");
			// Materialized seasonal slot + the re-generated exception
			// slot — the pair that used to split capacity publicly.
			await seedSchedule(ctx, {
				orgId: "org_ex_b",
				tourId: id,
				date,
				startTime: "09:00",
				endTime: "11:00",
			});
			await seedSchedule(ctx, {
				orgId: "org_ex_b",
				tourId: id,
				date,
				startTime: "14:00",
				endTime: "16:00",
				capacityTotal: 10,
				capacityBooked: 4,
			});
			await seedException(ctx, {
				orgId: "org_ex_b",
				tourId: id,
				date,
				exceptionType: "modified",
				startTime: "14:00",
				endTime: "16:00",
				capacityOverride: 5,
			});
			return id;
		});

		const slots = await t.query(api.public_booking.listAvailableSlots, {
			slug: "beta",
			tourId,
			date,
		});
		expect(slots).toHaveLength(1);
		expect(slots[0]?.startTime).toBe("14:00");
		expect(slots[0]?.capacityTotal).toBe(5);
		expect(slots[0]?.seatsLeft).toBe(1);
	});

	it("internalCreate rejects a booking on a removed-exception date", async () => {
		const t = convexTest(schema, modules);
		const date = futureDate(4);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, "org_ex_c");
			await seedException(ctx, {
				orgId: "org_ex_c",
				tourId: id,
				date,
				exceptionType: "removed",
			});
			return id;
		});

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: "org_ex_c",
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date,
				startTime: "10:00",
				guests: 2,
			}),
		).rejects.toThrow(/not available for booking/);
	});

	it("internalCreate rejects a startTime that does not match the modified exception", async () => {
		const t = convexTest(schema, modules);
		const date = futureDate(4);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, "org_ex_d");
			await seedSchedule(ctx, {
				orgId: "org_ex_d",
				tourId: id,
				date,
				startTime: "09:00",
			});
			await seedException(ctx, {
				orgId: "org_ex_d",
				tourId: id,
				date,
				exceptionType: "modified",
				startTime: "14:00",
				endTime: "16:00",
			});
			return id;
		});

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: "org_ex_d",
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date,
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/time slot is not available/);
	});

	it("internalCreate enforces capacityOverride on the attached schedule", async () => {
		const t = convexTest(schema, modules);
		const date = futureDate(4);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, "org_ex_e");
			await seedSchedule(ctx, {
				orgId: "org_ex_e",
				tourId: id,
				date,
				startTime: "09:00",
				capacityTotal: 10,
				capacityBooked: 3,
			});
			await seedException(ctx, {
				orgId: "org_ex_e",
				tourId: id,
				date,
				exceptionType: "modified",
				startTime: "09:00",
				endTime: "11:00",
				capacityOverride: 4,
			});
			return id;
		});

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: "org_ex_e",
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date,
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/Not enough seats/);
	});
});

describe("tourSchedules — reschedule guard on booked departures (F346)", () => {
	it("internalUpdate refuses to move date of a schedule that has bookings", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) => seedTour(ctx, "org_ex_f"));
		const scheduleId = await t.run(async (ctx) =>
			seedSchedule(ctx, {
				orgId: "org_ex_f",
				tourId,
				date: futureDate(4),
				startTime: "09:00",
				capacityBooked: 3,
			}),
		);

		await expect(
			t.mutation(internal.tourSchedules.internalUpdate, {
				organizationId: "org_ex_f",
				userId: "user-1",
				scheduleId,
				date: futureDate(5),
			}),
		).rejects.toThrow(/Cannot reschedule a departure with 3 booked/);
	});

	it("internalUpdate refuses to move startTime of a booked schedule but allows an unbooked one", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) => seedTour(ctx, "org_ex_g"));
		const [bookedId, freeId] = await t.run(async (ctx) => [
			await seedSchedule(ctx, {
				orgId: "org_ex_g",
				tourId,
				date: futureDate(4),
				startTime: "09:00",
				capacityBooked: 1,
			}),
			await seedSchedule(ctx, {
				orgId: "org_ex_g",
				tourId,
				date: futureDate(4),
				startTime: "14:00",
				endTime: "16:00",
				capacityBooked: 0,
			}),
		]);

		await expect(
			t.mutation(internal.tourSchedules.internalUpdate, {
				organizationId: "org_ex_g",
				userId: "user-1",
				scheduleId: bookedId,
				startTime: "10:00",
			}),
		).rejects.toThrow(/Cannot reschedule/);

		const ok = await t.mutation(internal.tourSchedules.internalUpdate, {
			organizationId: "org_ex_g",
			userId: "user-1",
			scheduleId: freeId,
			startTime: "15:00",
		});
		expect(ok).toBe(freeId);
	});
});

// ---- GT-AUDIT-02 / hub F602: capacityOverride on the free-text path ----
//
// The listing honours the cap — listAvailableSlots drops a slot once
// capacityBooked reaches capacityOf(capacityTotal) (public_booking.ts:255) and
// reports the capped seatsLeft (:267). But create's guard was
// `if (scheduleId && ex?.capacityOverride !== undefined)`, and the free-text
// start-time branch leaves scheduleId undefined. So the cap was never read
// there, and because incrementBooked is also gated on `if (scheduleId)`, NO
// capacity was enforced at all: a guest could book 8 seats on a date the
// operator had capped at 2.
//
// The cap is defined against a materialized slot (capacityBooked lives on the
// schedule), so with no slot there is nothing to compare against and the
// bookings table has no index on (tourId, date) to count unmaterialized
// bookings. Rather than add an unbounded scan, the path must fail safe: refuse
// rather than silently oversell an operator's cap.

describe("public_booking — capacityOverride when no schedule materializes (GT-AUDIT-02)", () => {
	const ORG = "org_cap_free_text";

	async function seedCappedDate(t: ReturnType<typeof convexTest>) {
		const date = futureDate(9);
		const tourId = await t.run(async (ctx) => {
			const id = await seedTour(ctx, ORG);
			await seedException(ctx, {
				orgId: ORG,
				tourId: id,
				date,
				exceptionType: "modified",
				startTime: "18:00",
				capacityOverride: 2,
			});
			return id;
		});
		return { date, tourId };
	}

	it("refuses an oversized free-text booking instead of silently overselling", async () => {
		const t = convexTest(schema, modules);
		const { date, tourId } = await seedCappedDate(t);

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: ORG,
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date,
				// Free-text time, matching the exception's slot. No scheduleId:
				// the date has no materialized schedules.
				startTime: "18:00",
				guests: 8,
			}),
		).rejects.toThrow();
	});

	it("writes no booking when it refuses", async () => {
		const t = convexTest(schema, modules);
		const { date, tourId } = await seedCappedDate(t);

		await t
			.mutation(internal.public_booking.internalCreate, {
				organizationId: ORG,
				tourId,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date,
				startTime: "18:00",
				guests: 8,
			})
			.catch(() => undefined);

		const bookings = await t.run(async (ctx) =>
			ctx.db
				.query("bookings")
				.withIndex("by_org")
				.filter((q) => q.eq(q.field("organizationId"), ORG))
				.collect(),
		);
		expect(bookings).toHaveLength(0);
	});

	// A deliberate trade-off, asserted so it cannot be "fixed" by accident:
	// a request UNDER the cap is refused too. Accepting it would look safe but
	// is not — with no materialized slot nothing knows how many seats are
	// already booked, so three accepted 2-guest requests would still oversell a
	// cap of 2. Honouring the operator's ceiling means refusing the whole
	// unmaterialized path on a capped date and sending the guest to the
	// operator, who can materialize a slot and book it properly.
	it("refuses even a within-cap free-text booking, and says why", async () => {
		const t = convexTest(schema, modules);
		const { date, tourId } = await seedCappedDate(t);

		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: ORG,
				tourId,
				customerName: "Bob Visitor",
				customerEmail: "bob@example.com",
				date,
				startTime: "18:00",
				guests: 2,
			}),
		).rejects.toThrow(/limited capacity.*cannot be booked online/);
	});

	it("leaves a free-text booking untouched when no override is set", async () => {
		// No cap on the date -> nothing to enforce, so the path must keep working.
		const t = convexTest(schema, modules);
		const date = futureDate(11);
		const tourId = await t.run((ctx) => seedTour(ctx, ORG));

		const bookingId = await t.mutation(internal.public_booking.internalCreate, {
			organizationId: ORG,
			tourId,
			customerName: "Cara Visitor",
			customerEmail: "cara@example.com",
			date,
			startTime: "09:00",
			guests: 8,
		});
		expect(bookingId).toBeTruthy();
	});
});
