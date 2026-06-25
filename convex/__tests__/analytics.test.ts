import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.{ts,tsx}");

async function seedTour(
	ctx: any,
	orgId: string,
	name = "Walking Tour",
) {
	return await ctx.db.insert("tours", {
		organizationId: orgId,
		name,
		description: "",
		durationHours: 2,
		isActive: true,
		recurrenceType: "none" as const,
		recurrenceDaysOfWeek: [],
		capacity: 20,
		bufferMinutes: 15,
		minGuests: 1,
		maxGuests: 20,
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

async function seedCustomer(ctx: any, orgId: string) {
	return await ctx.db.insert("customers", {
		organizationId: orgId,
		name: "Test Customer",
		email: "test@example.com",
		phone: "+1555000000",
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
}

async function seedBooking(
	ctx: any,
	orgId: string,
	tourId: any,
	customerId: any,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("bookings", {
		organizationId: orgId,
		tourId,
		customerId,
		date: "2026-07-15",
		startTime: "09:00",
		guests: 2,
		guestNames: "",
		languageRequired: "en",
		notes: "",
		status: "confirmed",
		depositAmountCents: 0n,
		totalAmountCents: 5000n,
		balanceDueCents: 0n,
		paymentMethod: "",
		checkedInBy: "",
		netRevenueCents: 5000n,
		source: "direct",
		reviewComment: "",
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

async function seedAssignment(
	ctx: any,
	orgId: string,
	tourId: any,
	overrides: Record<string, any> = {},
) {
	return await ctx.db.insert("assignments", {
		organizationId: orgId,
		tourId,
		guideId: "guide-1",
		date: "2026-07-15",
		startTime: "09:00",
		endTime: "11:00",
		status: "scheduled",
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	});
}

describe("analytics", () => {
	it("getOverview: returns correct counts", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a1";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		await t.run((ctx: any) => seedAssignment(ctx, orgId, tourId));
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, {
				status: "completed",
				date: "2026-07-16",
			}),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, {
				status: "cancelled",
				date: "2026-07-17",
			}),
		);

		const overview = await t.query(api.analytics.getOverview, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
		});
		expect(overview.totalTours).toBe(1);
		expect(overview.totalAssignments).toBe(3);
		expect(overview.completedAssignments).toBe(1);
		expect(overview.cancelledAssignments).toBe(1);
		expect(overview.completionRate).toBe(33.3);
	});

	it("getTourStats: groups by tour", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a2";
		const t1 = await t.run((ctx: any) => seedTour(ctx, orgId, "Tour A"));
		const t2 = await t.run((ctx: any) => seedTour(ctx, orgId, "Tour B"));
		await t.run((ctx: any) => seedAssignment(ctx, orgId, t1));
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, t1, { date: "2026-07-16" }),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, t2, { date: "2026-07-17" }),
		);

		const stats = await t.query(api.analytics.getTourStats, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
		});
		expect(stats.length).toBe(2);
		expect(stats[0]!.tourName).toBe("Tour A");
		expect(stats[0]!.totalAssignments).toBe(2);
		expect(stats[1]!.tourName).toBe("Tour B");
		expect(stats[1]!.totalAssignments).toBe(1);
	});

	it("getDailyStats: fills zeros for empty days", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a3";
		const stats = await t.query(api.analytics.getDailyStats, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-03",
		});
		expect(stats.length).toBe(3);
		expect(stats[0]!.total).toBe(0);
		expect(stats[1]!.total).toBe(0);
		expect(stats[2]!.total).toBe(0);
	});

	it("getRevenueSummary: sums revenue and guests", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a4";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, { guests: 4, totalAmountCents: 10000n, netRevenueCents: 10000n }),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, { guests: 2, totalAmountCents: 5000n, netRevenueCents: 5000n }),
		);

		const summary = await t.query(api.analytics.getRevenueSummary, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
		});
		expect(summary.totalBookings).toBe(2);
		expect(summary.totalGuests).toBe(6);
		expect(summary.totalRevenueCents).toBe(15000);
		expect(summary.avgBookingValueCents).toBe(7500);
	});

	it("getBookingSources: groups by source", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a5";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, { source: "viator" }),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, { source: "viator" }),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, { source: "direct" }),
		);

		const sources = await t.query(api.analytics.getBookingSources, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
		});
		expect(sources.length).toBe(2);
		expect(sources[0]!.source).toBe("viator");
		expect(sources[0]!.totalBookings).toBe(2);
		expect(sources[1]!.source).toBe("direct");
		expect(sources[1]!.totalBookings).toBe(1);
	});
});
