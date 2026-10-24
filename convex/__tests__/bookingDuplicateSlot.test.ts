// F1006: the same unique() on by_tour_date_start that F694 fixed in
// assertScheduleSlotFree and the public booking create survives at the
// STAFF booking create (convex/bookings.ts) and at the BOOKING MOVE
// (convex/lib/bookingsLifecycle.ts).
//
// A cancel/re-create cycle leaves TWO schedules for the same
// (tourId, date, startTime) — the shape convex/ops.ts documents and reads
// with take(20) plus a JS filter for exactly this reason. On such a pair
// both paths died on Convex's opaque "unique() query returned more than
// one result" engine error instead of refusing the slot the way F694's
// sites now do. take(2) plus a length check answers the same question
// without the crash.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import {
	seedBooking,
	seedCustomer,
	seedSchedule,
	seedTour,
} from "./helpers";

const modules = import.meta.glob("../**/*.{ts,tsx}");

const { mockState } = vi.hoisted(() => ({
	mockState: {
		user: null as { _id: string; name: string; email: string } | null,
		session: null as { activeOrganizationId?: string | null } | null,
		orgs: [] as Array<{
			id: string;
			name: string;
			members: Array<{ userId: string; role: string }>;
		}>,
	},
}));

vi.mock("../auth", () => ({
	authComponent: {
		getAuthUser: async () => mockState.user,
		safeGetAuthUser: async () => mockState.user ?? undefined,
		getAuth: async () => ({
			auth: {
				api: {
					getSession: async () =>
						mockState.session
							? { session: mockState.session, user: mockState.user }
							: null,
					listOrganizations: async () => mockState.orgs,
					listMembers: async (args: {
						query: { organizationId: string };
					}) => ({
						members:
							mockState.orgs.find(
								(org) => org.id === args.query.organizationId,
							)?.members ?? [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

const ORG = "org_f1006";
const USER = { _id: "user_f1006", name: "Staff", email: "staff@example.com" };

/** YYYY-MM-DD far enough ahead that the booking-cutoff window
 *  (seedTour sets bookingCutoffHours: 24) does not reject the fixture. */
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
	t: ReturnType<typeof convexTest>,
	tourId: Id<"tours">,
	date: string,
	startTime: string,
): Promise<void> {
	await t.run(async (ctx) => {
		const cancelled = await seedSchedule(ctx, {
			orgId: ORG,
			tourId,
			date,
			startTime,
		});
		await ctx.db.patch(cancelled, { status: "cancelled" });
		await seedSchedule(ctx, { orgId: ORG, tourId, date, startTime });
	});
}

/** The message the rejected mutation threw: the authored ConvexError
 *  text when the check refused the slot, or Convex's opaque engine
 *  error when it crashed instead. */
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

beforeEach(() => {
	mockState.user = USER;
	mockState.session = { activeOrganizationId: ORG };
	mockState.orgs = [
		{
			id: ORG,
			name: "Test Org",
			members: [{ userId: USER._id, role: "owner" }],
		},
	];
});

describe("booking paths on a slot that already holds two schedules (F1006)", () => {
	it("refuses a staff booking create with the friendly error (F1006)", async () => {
		const t = convexTest(schema, modules);
		const date = futureDate(30);
		const fixture = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			return { tourId, customerId };
		});
		await seedDuplicateSlot(t, fixture.tourId, date, "10:00");

		const message = await rejectionMessage(
			t.mutation(api.bookings.create, {
				tourId: fixture.tourId,
				customerId: fixture.customerId,
				date,
				startTime: "10:00",
				guests: 2,
			}),
		);

		expect(message).toMatch(
			/already exists for this tour on .* at 10:00/,
		);
		expect(message).not.toMatch(
			/unique\(\) query returned more than one result/,
		);

		// No booking, and no capacity claimed on either duplicate row.
		const state = await t.run(async (ctx) => ({
			bookings: await ctx.db.query("bookings").collect(),
			schedules: await ctx.db.query("tourSchedules").collect(),
		}));
		expect(state.bookings).toHaveLength(0);
		expect(state.schedules.every((s) => s.capacityBooked === 0)).toBe(true);
	});

	it("refuses a booking move onto the duplicated slot with the friendly error (F1006)", async () => {
		const t = convexTest(schema, modules);
		const targetDate = futureDate(30);
		const fixture = await t.run(async (ctx) => {
			const tourId = await seedTour(ctx, { orgId: ORG });
			const customerId = await seedCustomer(ctx, { orgId: ORG });
			const bookingId = await seedBooking(ctx, {
				orgId: ORG,
				tourId,
				customerId,
				date: futureDate(40),
				startTime: "09:00",
			});
			return { tourId, customerId, bookingId };
		});
		await seedDuplicateSlot(t, fixture.tourId, targetDate, "10:00");

		const message = await rejectionMessage(
			t.mutation(internal.bookings.internalUpdate, {
				bookingId: fixture.bookingId,
				date: targetDate,
				startTime: "10:00",
			}),
		);

		expect(message).toMatch(
			/already exists for this tour on .* at 10:00/,
		);
		expect(message).not.toMatch(
			/unique\(\) query returned more than one result/,
		);

		// The booking kept its original slot, and no duplicate row moved.
		const state = await t.run(async (ctx) => ({
			booking: await ctx.db.get(fixture.bookingId),
			schedules: await ctx.db.query("tourSchedules").collect(),
		}));
		expect(state.booking?.date).toBe(futureDate(40));
		expect(state.booking?.startTime).toBe("09:00");
		expect(state.schedules.every((s) => s.capacityBooked === 0)).toBe(true);
	});
});
