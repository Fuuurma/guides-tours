// F738: staff booking creation must reject inactive and soft-deleted tours,
// matching the public booking path before a booking or schedule claim exists.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { seedCustomer, seedSchedule, seedTour } from "./helpers";

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
							mockState.orgs.find((org) => org.id === args.query.organizationId)
								?.members ?? [],
					}),
				},
			},
			headers: new Headers(),
		}),
	},
	createAuth: (() => ({})) as never,
}));

const ORG = "org_f738";
const USER = { _id: "user_f738", name: "Staff", email: "staff@example.com" };
const DATE = "2099-06-15";

function setOwner() {
	mockState.user = USER;
	mockState.session = { activeOrganizationId: ORG };
	mockState.orgs = [
		{
			id: ORG,
			name: "Test Org",
			members: [{ userId: USER._id, role: "owner" }],
		},
	];
}

beforeEach(() => {
	setOwner();
});

async function seedFixture(
	t: ReturnType<typeof convexTest>,
	options: { isActive?: boolean; deletedAt?: number } = {},
) {
	return await t.run(async (ctx) => {
		const tourId = await seedTour(ctx, {
			orgId: ORG,
			isActive: options.isActive,
			deletedAt: options.deletedAt,
		});
		const customerId = await seedCustomer(ctx, { orgId: ORG });
		const scheduleId = await seedSchedule(ctx, {
			orgId: ORG,
			tourId,
			date: DATE,
			capacityTotal: 10,
		});
		return { tourId, customerId, scheduleId };
	});
}

describe("bookings.create inactive tour guard (F738)", () => {
	it.each([
		{ state: "inactive", options: { isActive: false } },
		{ state: "soft-deleted", options: { deletedAt: 1 } },
	])("rejects a $state tour without booking or capacity side effects", async ({ options }) => {
		const t = convexTest(schema, modules);
		const fixture = await seedFixture(t, options);

		await expect(
			t.mutation(api.bookings.create, {
				tourId: fixture.tourId,
				customerId: fixture.customerId,
				date: DATE,
				startTime: "09:00",
				guests: 2,
				scheduleId: fixture.scheduleId,
			}),
		).rejects.toThrow("Tour is not active");

		const state = await t.run(async (ctx) => ({
			bookings: await ctx.db.query("bookings").collect(),
			schedule: await ctx.db.get(fixture.scheduleId),
			customer: await ctx.db.get(fixture.customerId),
		}));
		expect(state.bookings).toHaveLength(0);
		expect(state.schedule?.capacityBooked).toBe(0);
		expect(state.customer?.nextBookingDate).toBeUndefined();
	});

	it("creates an active-tour booking and claims its schedule capacity", async () => {
		const t = convexTest(schema, modules);
		const fixture = await seedFixture(t);

		const bookingId = await t.mutation(api.bookings.create, {
			tourId: fixture.tourId,
			customerId: fixture.customerId,
			date: DATE,
			startTime: "09:00",
			guests: 2,
			scheduleId: fixture.scheduleId,
		});

		const state = await t.run(async (ctx) => ({
			booking: await ctx.db.get(bookingId),
			schedule: await ctx.db.get(fixture.scheduleId),
		}));
		expect(state.booking?.scheduleId).toBe(fixture.scheduleId);
		expect(state.booking?.capacityClaimedScheduleId).toBe(fixture.scheduleId);
		expect(state.schedule?.capacityBooked).toBe(2);
	});
});
