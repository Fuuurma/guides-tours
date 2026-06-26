// Tests for the OTA upsert commission math.
//
// Verifies that netRevenueCents is correctly computed from
// (totalPaidCents, commissionCents, commissionRate) in the various
// combinations that providers may send.

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

type TestCtx = GenericMutationCtx<DataModel>;

async function seedOtaProductLookup(
	ctx: TestCtx,
	organizationId: string,
	productId: string,
	commissionRate: number,
) {
	const integrationId = await ctx.db.insert("otaIntegrations", {
		organizationId,
		provider: "viator",
		apiKey: "enc",
		isActive: true,
		isSandbox: true,
		autoSyncAvailability: false,
		autoSyncPricing: false,
		syncIntervalMinutes: 60,
		settings: {},
		createdAt: 0,
		updatedAt: 0,
	});
	const tourId = await ctx.db.insert("tours", {
		organizationId,
		name: "Test Tour",
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none" as const,
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
	const otaProductId = await ctx.db.insert("otaProducts", {
		organizationId,
		tourId,
		integrationId,
		otaProductId: productId,
		otaTitle: "Test OTA Product",
		otaCurrency: "USD",
		commissionRate,
		otaPhotos: [],
		minAdvanceBookingHours: 24,
		maxAdvanceBookingDays: 365,
		syncStatus: "synced",
		settings: {},
		createdAt: 0,
		updatedAt: 0,
	});
	return { integrationId, tourId, otaProductId };
}

describe("convex/ota/upsert — commission math", () => {
	it("derives commissionCents from rate when only rate is sent", async () => {
		const t = convexTest(schema, modules);
		const organizationId = "org_cm_a";
		await t.run(async (ctx) => {
			await seedOtaProductLookup(ctx as TestCtx, organizationId, "PROD-1", 0.2);
		});
		const { id } = (await t.mutation(
			internal.ota.upsert.upsertOtaBooking,
			{
				integrationId: (await t.run(async (ctx) =>
					(await ctx.db.query("otaIntegrations").first())!._id,
				)) as Id<"otaIntegrations">,
				organizationId,
				provider: "viator",
				event: {
					kind: "booking.created" as const,
					reservationId: "RES-1",
					customerName: "Alice",
					customerEmail: "alice@example.com",
					tourDate: "2026-08-15",
					guests: 2,
					// 100.00 USD paid, 20% commission → 20.00 commission, 80.00 net
					totalPaidCents: 10000n,
					currency: "USD",
					commissionRate: 0.2,
					rawPayload: {},
				},
				rawData: {},
			},
		)) as { id: Id<"otaBookings">; created: boolean };
		const row = (await t.run(async (ctx) => ctx.db.get(id))) as any;
		expect(row?.commissionRate).toBeCloseTo(0.2);
		expect(row?.commissionAmountCents).toBe(2000n);
		expect(row?.netRevenueCents).toBe(8000n);
	});

	it("uses explicit commissionCents when provided (skips rate calc)", async () => {
		const t = convexTest(schema, modules);
		const organizationId = "org_cm_b";
		await t.run(async (ctx) => {
			await seedOtaProductLookup(ctx as TestCtx, organizationId, "PROD-2", 0.2);
		});
		const integrationId = (await t.run(async (ctx) =>
			(await ctx.db.query("otaIntegrations").first())!._id,
		)) as Id<"otaIntegrations">;
		const { id } = (await t.mutation(
			internal.ota.upsert.upsertOtaBooking,
			{
				integrationId,
				organizationId,
				provider: "viator",
				event: {
					kind: "booking.created" as const,
					reservationId: "RES-2",
					customerName: "Bob",
					customerEmail: "bob@example.com",
					tourDate: "2026-08-16",
					guests: 1,
					totalPaidCents: 10000n,
					currency: "USD",
					// 15% rate would imply 1500, but explicit 2500 wins.
					commissionRate: 0.15,
					commissionCents: 2500n,
					rawPayload: {},
				},
				rawData: {},
			},
		)) as { id: Id<"otaBookings">; created: boolean };
		const row = (await t.run(async (ctx) => ctx.db.get(id))) as any;
		expect(row?.commissionAmountCents).toBe(2500n);
		expect(row?.netRevenueCents).toBe(7500n);
	});

	it("falls back to product commissionRate when event omits both", async () => {
		const t = convexTest(schema, modules);
		const organizationId = "org_cm_c";
		await t.run(async (ctx) => {
			await seedOtaProductLookup(ctx as TestCtx, organizationId, "PROD-3", 0.25);
		});
		const integrationId = (await t.run(async (ctx) =>
			(await ctx.db.query("otaIntegrations").first())!._id,
		)) as Id<"otaIntegrations">;
		const { id } = (await t.mutation(
			internal.ota.upsert.upsertOtaBooking,
			{
				integrationId,
				organizationId,
				provider: "viator",
				event: {
					kind: "booking.created" as const,
					reservationId: "RES-3",
					productId: "PROD-3",
					customerName: "Carol",
					customerEmail: "carol@example.com",
					tourDate: "2026-08-17",
					guests: 1,
					totalPaidCents: 4000n,
					currency: "USD",
					// No rate / no cents in event → fall back to product's 0.25
					rawPayload: {},
				},
				rawData: {},
			},
		)) as { id: Id<"otaBookings">; created: boolean };
		const row = (await t.run(async (ctx) => ctx.db.get(id))) as any;
		expect(row?.commissionAmountCents).toBe(1000n);
		expect(row?.netRevenueCents).toBe(3000n);
	});

	it("netRevenueCents = totalPaidCents when no commission info available", async () => {
		const t = convexTest(schema, modules);
		const organizationId = "org_cm_d";
		await t.run(async (ctx) => {
			await seedOtaProductLookup(ctx as TestCtx, organizationId, "PROD-4", 0);
		});
		const integrationId = (await t.run(async (ctx) =>
			(await ctx.db.query("otaIntegrations").first())!._id,
		)) as Id<"otaIntegrations">;
		const { id } = (await t.mutation(
			internal.ota.upsert.upsertOtaBooking,
			{
				integrationId,
				organizationId,
				provider: "viator",
				event: {
					kind: "booking.created" as const,
					reservationId: "RES-4",
					customerName: "Dan",
					customerEmail: "dan@example.com",
					tourDate: "2026-08-18",
					guests: 1,
					totalPaidCents: 5000n,
					currency: "USD",
					rawPayload: {},
				},
				rawData: {},
			},
		)) as { id: Id<"otaBookings">; created: boolean };
		const row = (await t.run(async (ctx) => ctx.db.get(id))) as any;
		expect(row?.commissionAmountCents).toBeUndefined();
		expect(row?.netRevenueCents).toBe(5000n);
	});
});
