import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(ctx: any, orgId: string) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name: "T",
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
}

describe("tour analytics cache", () => {
	it("upsert: creates analytics row", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta1";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourAnalytics.internalUpsert, {
			organizationId: orgId,
			userId: "test-user",
			tourId,
			periodDate: "2026-09-01",
			periodType: "daily",
			totalBookings: 5,
			totalGuests: 12,
			grossRevenueCents: 50000n,
			netRevenueCents: 45000n,
			cancellations: 0,
			noShows: 0,
			avgGroupSize: 2.4,
			utilizationRate: 0.6,
			totalCapacity: 20,
		});
		expect(id).toBeDefined();
		const row = (await t.run((ctx) => ctx.db.get(id))) as any;
		expect(row?.totalBookings).toBe(5);
		expect(row?.utilizationRate).toBe(0.6);
	});

	it("upsert: patches existing row by (tour, periodDate)", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta2";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.mutation(internal.tourAnalytics.internalUpsert, {
			organizationId: orgId,
			userId: "test-user",
			tourId,
			periodDate: "2026-09-01",
			periodType: "daily",
			totalBookings: 5,
			totalGuests: 12,
			grossRevenueCents: 50000n,
			netRevenueCents: 45000n,
			cancellations: 0,
			noShows: 0,
			avgGroupSize: 2.4,
			utilizationRate: 0.6,
			totalCapacity: 20,
		});
		await t.mutation(internal.tourAnalytics.internalUpsert, {
			organizationId: orgId,
			userId: "test-user",
			tourId,
			periodDate: "2026-09-01",
			periodType: "daily",
			totalBookings: 7,
			totalGuests: 18,
			grossRevenueCents: 70000n,
			netRevenueCents: 63000n,
			cancellations: 1,
			noShows: 0,
			avgGroupSize: 2.6,
			utilizationRate: 0.9,
			totalCapacity: 20,
		});
		const all = (await t.run((ctx) =>
			ctx.db.query("tourAnalytics").collect(),
		)) as any;
		expect(all.length).toBe(1);
		expect(all[0].totalBookings).toBe(7);
	});

	it("upsert: rejects utilizationRate out of range", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta3";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await expect(
			t.mutation(internal.tourAnalytics.internalUpsert, {
				organizationId: orgId,
				userId: "test-user",
				tourId,
				periodDate: "2026-09-01",
				periodType: "daily",
				totalBookings: 0,
				totalGuests: 0,
				grossRevenueCents: 0n,
				netRevenueCents: 0n,
				cancellations: 0,
				noShows: 0,
				avgGroupSize: 0,
				utilizationRate: 1.5, // out of range
				totalCapacity: 0,
			}),
		).rejects.toThrow(/0\.\.1/);
	});

	it("upsert: rejects cross-org tour", async () => {
		const t = convexTest(schema, modules);
		const tourId = await t.run((ctx) => seedTour(ctx, "org_ta4a"));
		await expect(
			t.mutation(internal.tourAnalytics.internalUpsert, {
				organizationId: "org_ta4b",
				userId: "test-user",
				tourId,
				periodDate: "2026-09-01",
				periodType: "daily",
				totalBookings: 0,
				totalGuests: 0,
				grossRevenueCents: 0n,
				netRevenueCents: 0n,
				cancellations: 0,
				noShows: 0,
				avgGroupSize: 0,
				utilizationRate: 0,
				totalCapacity: 0,
			}),
		).rejects.toThrow(/Forbidden/);
	});

	it("remove: deletes analytics row", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta5";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		const id = await t.mutation(internal.tourAnalytics.internalUpsert, {
			organizationId: orgId,
			userId: "test-user",
			tourId,
			periodDate: "2026-09-01",
			periodType: "daily",
			totalBookings: 0,
			totalGuests: 0,
			grossRevenueCents: 0n,
			netRevenueCents: 0n,
			cancellations: 0,
			noShows: 0,
			avgGroupSize: 0,
			utilizationRate: 0,
			totalCapacity: 0,
		});
		await t.mutation(internal.tourAnalytics.internalRemove, {
			organizationId: orgId,
			userId: "test-user",
			analyticsId: id,
		});
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(row).toBeNull();
	});

	it("computeForOrgDay: upserts daily rows from bookings", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_ta6";
		const tourId = await t.run((ctx) => seedTour(ctx, orgId));
		await t.run(async (ctx) => {
			const customerId = await ctx.db.insert("customers", {
				organizationId: orgId,
				name: "C",
				email: "c@example.com",
				phone: "",
				notes: "",
				smsConsent: false,
				emailConsent: false,
				preferredLanguage: "en",
				tags: [],
				source: "direct",
				sourceDetails: "",
				specialRequirements: "",
				vipStatus: false,
				loyaltyPoints: 0,
				totalVisits: 0,
				totalRevenueCents: 0n,
				createdAt: 0,
				updatedAt: 0,
			});
			await ctx.db.insert("bookings", {
				organizationId: orgId,
				tourId,
				customerId,
				date: "2026-09-10",
				startTime: "09:00",
				guests: 5,
				guestNames: "",
				languageRequired: "en",
				notes: "",
				status: "confirmed",
				depositAmountCents: 0n,
				totalAmountCents: 25000n,
				balanceDueCents: 25000n,
				paymentMethod: "",
				checkedInBy: "",
				netRevenueCents: 25000n,
				source: "direct",
				reviewComment: "",
				createdAt: 0,
				updatedAt: 0,
			});
			await ctx.db.insert("bookings", {
				organizationId: orgId,
				tourId,
				customerId,
				date: "2026-09-10",
				startTime: "14:00",
				guests: 2,
				guestNames: "",
				languageRequired: "en",
				notes: "",
				status: "cancelled",
				depositAmountCents: 0n,
				totalAmountCents: 10000n,
				balanceDueCents: 0n,
				paymentMethod: "",
				checkedInBy: "",
				netRevenueCents: 0n,
				source: "direct",
				reviewComment: "",
				createdAt: 0,
				updatedAt: 0,
			});
		});

		const result = await t.mutation(internal.tourAnalytics.computeForOrgDay, {
			organizationId: orgId,
			periodDate: "2026-09-10",
		});
		expect(result.upserted).toBe(1);

		const rows = await t.run((ctx) =>
			ctx.db
				.query("tourAnalytics")
				.withIndex("by_tour_period", (q) =>
					q.eq("tourId", tourId).eq("periodDate", "2026-09-10"),
				)
				.collect(),
		);
		expect(rows.length).toBe(1);
		expect(rows[0]!.totalBookings).toBe(1);
		expect(rows[0]!.totalGuests).toBe(5);
		expect(rows[0]!.cancellations).toBe(1);
		expect(rows[0]!.utilizationRate).toBe(0.5);
		expect(rows[0]!.avgGroupSize).toBe(5);
	});
});
