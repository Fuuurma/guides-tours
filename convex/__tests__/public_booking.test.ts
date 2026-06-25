// Tests for the public booking flow.
//
// We test the internalCreate mutation directly. The httpAction
// wrapper is intentionally not tested in vitest (Convex action/http
// testing requires the live runtime — see convex/http.ts).

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel> & {
	storage: { getUrl: (id: string) => Promise<string | null> };
};

async function seedTour(
	ctx: TestCtx,
	orgId: string,
	maxGuests = 15,
	isActive = true,
): Promise<Id<"tours">> {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "Old Town Walk",
		description: "",
		durationHours: 2,
		isActive,
		recurrenceType: "none",
		recurrenceDaysOfWeek: [],
		capacity: maxGuests,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests,
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

describe("convex/public_booking — internalCreate mutation", () => {
	it("creates a confirmed booking for a valid tour in the org", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_a";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId: tourId as string,
				customerName: "Alice Visitor",
				customerEmail: "alice@example.com",
				date: "2026-08-15",
				startTime: "10:00",
				guests: 2,
			},
		);
		const booking = await t.run(async (ctx) =>
			ctx.db.get(bookingId),
		);
		expect(booking).not.toBeNull();
		expect(booking?.status).toBe("confirmed");
		expect(booking?.source).toBe("public_booking");
	});

	it("get-or-create customer: re-uses existing customer for same email", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_b";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		const bookingId1 = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId: tourId as string,
				customerName: "Bob",
				customerEmail: "bob@example.com",
				date: "2026-08-20",
				startTime: "09:00",
				guests: 1,
			},
		);
		const bookingId2 = await t.mutation(
			internal.public_booking.internalCreate,
			{
				organizationId: orgId,
				tourId: tourId as string,
				customerName: "Bob Updated",
				customerEmail: "bob@example.com",
				date: "2026-08-21",
				startTime: "09:00",
				guests: 3,
			},
		);
		const b1 = await t.run(async (ctx) => ctx.db.get(bookingId1));
		const b2 = await t.run(async (ctx) => ctx.db.get(bookingId2));
		expect(b1?.customerId).toBe(b2?.customerId);
	});

	it("rejects inactive tours", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_c";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, 10, false),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId: tourId as string,
				customerName: "Carol",
				customerEmail: "carol@example.com",
				date: "2026-08-22",
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/not active/);
	});

	it("rejects guests > maxGuests", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_d";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId, 5),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: orgId,
				tourId: tourId as string,
				customerName: "Dan",
				customerEmail: "dan@example.com",
				date: "2026-08-23",
				startTime: "09:00",
				guests: 10,
			}),
		).rejects.toThrow(/maximum of 5/);
	});

	it("rejects when tour belongs to a different org", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, "org_other"),
		);
		await expect(
			t.mutation(internal.public_booking.internalCreate, {
				organizationId: "org_pub_e",
				tourId: tourId as string,
				customerName: "Eve",
				customerEmail: "eve@example.com",
				date: "2026-08-24",
				startTime: "09:00",
				guests: 2,
			}),
		).rejects.toThrow(/Tour not found/);
	});

	it("writes audit log with action 'booking.created_public'", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pub_f";
		const tourId = await t.run(async (ctx) =>
			seedTour(ctx as unknown as TestCtx, orgId),
		);
		await t.mutation(internal.public_booking.internalCreate, {
			organizationId: orgId,
			tourId: tourId as string,
			customerName: "Frank",
			customerEmail: "frank@example.com",
			date: "2026-08-25",
			startTime: "09:00",
			guests: 2,
		});
		const auditLogs = await t.run(async (ctx) =>
			ctx.db.query("auditLogs").collect(),
		);
		const created = auditLogs.find(
			(l: { action: string }) => l.action === "booking.created_public",
		);
		expect(created).toBeDefined();
	});
});