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
