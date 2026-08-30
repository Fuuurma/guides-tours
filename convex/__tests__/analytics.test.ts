import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { internal } from "../_generated/api";

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

		const overview = await t.query(
			internal.analytics.getOverviewInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
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

		const stats = await t.query(
			internal.analytics.getTourStatsInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
		expect(stats.length).toBe(2);
		expect(stats[0]!.tourName).toBe("Tour A");
		expect(stats[0]!.totalAssignments).toBe(2);
		expect(stats[1]!.tourName).toBe("Tour B");
		expect(stats[1]!.totalAssignments).toBe(1);
	});

	it("getForTour: bookings + assignments for one tour", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a2b";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId, "Solo"));
		const other = await t.run((ctx: any) => seedTour(ctx, orgId, "Other"));
		const customerId = await t.run((ctx: any) => seedCustomer(ctx, orgId));
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, customerId, {
				guests: 4,
				totalAmountCents: 10000n,
				netRevenueCents: 10000n,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, customerId, {
				date: "2026-07-16",
				status: "cancelled",
				guests: 2,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, other, customerId, {
				date: "2026-07-17",
				guests: 8,
			}),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, { status: "completed" }),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, other, { date: "2026-07-17" }),
		);

		const stats = await t.query(internal.analytics.getForTourInternal, {
			organizationId: orgId,
			tourId: tourId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
		});
		expect(stats).not.toBeNull();
		expect(stats!.totalBookings).toBe(1);
		expect(stats!.totalGuests).toBe(4);
		expect(stats!.totalRevenueCents).toBe(10000);
		expect(stats!.cancellations).toBe(1);
		expect(stats!.totalAssignments).toBe(1);
		expect(stats!.completedAssignments).toBe(1);
		expect(stats!.avgGroupSize).toBe(4);
	});

	it("getDailyStats: fills zeros for empty days", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_a3";
		const stats = await t.query(
			internal.analytics.getDailyStatsInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-03",
			},
		);
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

		const summary = await t.query(
			internal.analytics.getRevenueSummaryInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
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

		const sources = await t.query(
			internal.analytics.getBookingSourcesInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
		expect(sources.length).toBe(2);
		expect(sources[0]!.source).toBe("viator");
		expect(sources[0]!.totalBookings).toBe(2);
		expect(sources[1]!.source).toBe("direct");
		expect(sources[1]!.totalBookings).toBe(1);
	});

	it("getTopTours: ranks by revenue and respects limit", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_top_tours";
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));
		const tourA = await t.run((ctx: any) =>
			seedTour(ctx, orgId, "Premium Tour"),
		);
		const tourB = await t.run((ctx: any) =>
			seedTour(ctx, orgId, "Budget Tour"),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourA, custId, {
				totalAmountCents: 50000n,
				date: "2026-07-10",
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourA, custId, {
				totalAmountCents: 50000n,
				date: "2026-07-11",
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourB, custId, {
				totalAmountCents: 20000n,
				date: "2026-07-12",
			}),
		);

		const top = await t.query(internal.analytics.getTopToursInternal, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
			limit: 10,
		});
		expect(top.length).toBe(2);
		expect(top[0]!.tourName).toBe("Premium Tour");
		expect(top[0]!.totalBookings).toBe(2);
		expect(top[0]!.totalRevenueCents).toBe(100000);
		expect(top[1]!.tourName).toBe("Budget Tour");
		expect(top[1]!.totalBookings).toBe(1);

		// limit=1 returns only the top tour
		const limited = await t.query(internal.analytics.getTopToursInternal, {
			organizationId: orgId,
			startDate: "2026-07-01",
			endDate: "2026-07-31",
			limit: 1,
		});
		expect(limited.length).toBe(1);
		expect(limited[0]!.tourName).toBe("Premium Tour");
	});

	it("getGuideStats: groups by guide and counts statuses", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_guide_stats";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, { guideId: "guide_1" }),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, {
				guideId: "guide_1",
				status: "completed",
			}),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, {
				guideId: "guide_1",
				status: "cancelled",
			}),
		);
		await t.run((ctx: any) =>
			seedAssignment(ctx, orgId, tourId, { guideId: "guide_2" }),
		);

		const stats = await t.query(
			internal.analytics.getGuideStatsInternal,
			{
				organizationId: orgId,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
		expect(stats.length).toBe(2);
		const guide1 = stats.find((s: any) => s.guideId === "guide_1")!;
		expect(guide1.totalAssignments).toBe(3);
		expect(guide1.completed).toBe(1);
		expect(guide1.cancelled).toBe(1);
		const guide2 = stats.find((s: any) => s.guideId === "guide_2")!;
		expect(guide2.totalAssignments).toBe(1);
	});

	// Tenant isolation: queries for one org must not see another org's data,
	// even when given the wrong orgId via the internal path.
	it("getOverviewInternal: scoped to organizationId (tenant isolation)", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_iso_a";
		const orgB = "org_iso_b";
		const tourIdA = await t.run((ctx: any) => seedTour(ctx, orgA));
		const tourIdB = await t.run((ctx: any) => seedTour(ctx, orgB));
		await t.run((ctx: any) => seedAssignment(ctx, orgA, tourIdA));
		await t.run((ctx: any) => seedAssignment(ctx, orgA, tourIdA, { date: "2026-07-16" }));
		await t.run((ctx: any) => seedAssignment(ctx, orgB, tourIdB));
		await t.run((ctx: any) => seedAssignment(ctx, orgB, tourIdB, { date: "2026-07-17" }));
		await t.run((ctx: any) => seedAssignment(ctx, orgB, tourIdB, { date: "2026-07-18" }));

		const aOverview = await t.query(
			internal.analytics.getOverviewInternal,
			{
				organizationId: orgA,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
		const bOverview = await t.query(
			internal.analytics.getOverviewInternal,
			{
				organizationId: orgB,
				startDate: "2026-07-01",
				endDate: "2026-07-31",
			},
		);
		expect(aOverview.totalTours).toBe(1);
		expect(aOverview.totalAssignments).toBe(2);
		expect(bOverview.totalTours).toBe(1);
		expect(bOverview.totalAssignments).toBe(3);
	});

	// Tier 1: getWeeklyPulse — this week vs last week
	it("getWeeklyPulse: returns current + previous window side by side", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_pulse";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));

		// Last week (Aug 2–8): 2 bookings, $200
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-02",
				totalAmountCents: 10000n,
				guests: 2,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-05",
				totalAmountCents: 10000n,
				guests: 3,
			}),
		);
		// This week (Aug 9–15): 3 bookings, $300 + 1 cancelled
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-09",
				totalAmountCents: 10000n,
				guests: 4,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-11",
				totalAmountCents: 10000n,
				guests: 2,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-13",
				totalAmountCents: 10000n,
				guests: 5,
				status: "cancelled",
			}),
		);

		const pulse = await t.query(
			internal.analytics.getWeeklyPulseInternal,
			{
				organizationId: orgId,
				startDate: "2026-08-09",
				endDate: "2026-08-15",
			},
		);

		// This week: 2 active bookings (cancelled excluded), $200, 6 guests
		expect(pulse.bookings).toBe(2);
		expect(pulse.revenueCents).toBe(20000);
		expect(pulse.guests).toBe(6);
		expect(pulse.avgGroupSize).toBe(3);
		// Cancellation rate counts the cancelled vs active+cancelled.
		expect(pulse.cancellationRate).toBeCloseTo(33.3, 1);

		// Previous week: 2 bookings, $200, 5 guests, 0 cancellations
		expect(pulse.previousStartDate).toBe("2026-08-02");
		expect(pulse.previousEndDate).toBe("2026-08-08");
		expect(pulse.previousBookings).toBe(2);
		expect(pulse.previousRevenueCents).toBe(20000);
		expect(pulse.previousGuests).toBe(5);
		expect(pulse.previousCancellationRate).toBe(0);
	});

	it("getWeeklyPulse: zero data returns zeros (no NaN, no division by zero)", async () => {
		const t = convexTest(schema, modules);
		const pulse = await t.query(
			internal.analytics.getWeeklyPulseInternal,
			{
				organizationId: "org_empty",
				startDate: "2026-08-09",
				endDate: "2026-08-15",
			},
		);
		expect(pulse.bookings).toBe(0);
		expect(pulse.guests).toBe(0);
		expect(pulse.revenueCents).toBe(0);
		expect(pulse.avgGroupSize).toBe(0);
		expect(pulse.cancellationRate).toBe(0);
		expect(pulse.previousBookings).toBe(0);
	});

	it("getWeeklyPulse: handles a non-7-day window", async () => {
		const t = convexTest(schema, modules);
		// 14-day window: previous period should also be 14 days
		const pulse = await t.query(
			internal.analytics.getWeeklyPulseInternal,
			{
				organizationId: "org_14d",
				startDate: "2026-08-01",
				endDate: "2026-08-14",
			},
		);
		// windowMs = 13 days, so prevStart = 2026-07-18, prevEnd = 2026-07-31
		expect(pulse.previousStartDate).toBe("2026-07-18");
		expect(pulse.previousEndDate).toBe("2026-07-31");
	});

	it("getWeeklyPulse: invalid dates don't crash", async () => {
		const t = convexTest(schema, modules);
		const pulse = await t.query(
			internal.analytics.getWeeklyPulseInternal,
			{
				organizationId: "org_bad",
				startDate: "not-a-date",
				endDate: "also-not-a-date",
			},
		);
		expect(pulse.revenueCents).toBe(0);
		expect(pulse.bookings).toBe(0);
		expect(pulse.previousStartDate).toBe("not-a-date");
	});

	// Tier 2: getChannelRevenue — revenue + booking count per source.
	it("getChannelRevenue: aggregates revenue per source sorted by revenue", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_channels";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));

		// viator: 2 bookings, $300, 5 guests
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-01",
				source: "viator",
				totalAmountCents: 15000n,
				guests: 2,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-02",
				source: "viator",
				totalAmountCents: 15000n,
				guests: 3,
			}),
		);
		// direct: 1 booking, $100, 2 guests
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-03",
				source: "direct",
				totalAmountCents: 10000n,
				guests: 2,
			}),
		);
		// getyourguide: 1 booking, $400, 4 guests (highest revenue)
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-04",
				source: "getyourguide",
				totalAmountCents: 40000n,
				guests: 4,
			}),
		);
		// cancelled viator — must be excluded
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-05",
				source: "viator",
				totalAmountCents: 99999n,
				guests: 10,
				status: "cancelled",
			}),
		);

		const channels = await t.query(
			internal.analytics.getChannelRevenueInternal,
			{
				organizationId: orgId,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);

		expect(channels.length).toBe(3);
		// Sorted by revenue desc
		expect(channels[0]!.source).toBe("getyourguide");
		expect(channels[0]!.totalBookings).toBe(1);
		expect(channels[0]!.totalRevenueCents).toBe(40000);
		expect(channels[0]!.totalGuests).toBe(4);
		expect(channels[1]!.source).toBe("viator");
		expect(channels[1]!.totalBookings).toBe(2);
		expect(channels[1]!.totalRevenueCents).toBe(30000);
		expect(channels[1]!.totalGuests).toBe(5);
		expect(channels[2]!.source).toBe("direct");
		expect(channels[2]!.totalBookings).toBe(1);
		expect(channels[2]!.totalRevenueCents).toBe(10000);
	});

	it("getChannelRevenue: empty org returns []", async () => {
		const t = convexTest(schema, modules);
		const channels = await t.query(
			internal.analytics.getChannelRevenueInternal,
			{
				organizationId: "org_empty_channels",
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);
		expect(channels).toEqual([]);
	});

	it("getChannelRevenue: tenant isolation — other org's bookings invisible", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_chan_iso_a";
		const orgB = "org_chan_iso_b";
		const tourA = await t.run((ctx: any) => seedTour(ctx, orgA));
		const tourB = await t.run((ctx: any) => seedTour(ctx, orgB));
		const custA = await t.run((ctx: any) => seedCustomer(ctx, orgA));
		const custB = await t.run((ctx: any) => seedCustomer(ctx, orgB));

		await t.run((ctx: any) =>
			seedBooking(ctx, orgA, tourA, custA, {
				date: "2026-08-01",
				source: "viator",
				totalAmountCents: 10000n,
				guests: 1,
			}),
		);
		await t.run((ctx: any) =>
			seedBooking(ctx, orgB, tourB, custB, {
				date: "2026-08-01",
				source: "direct",
				totalAmountCents: 99999n,
				guests: 10,
			}),
		);

		const aChannels = await t.query(
			internal.analytics.getChannelRevenueInternal,
			{
				organizationId: orgA,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);
		expect(aChannels.length).toBe(1);
		expect(aChannels[0]!.source).toBe("viator");
		expect(aChannels[0]!.totalRevenueCents).toBe(10000);
	});

	// Tier 4: getFinancialHealth — refund rate, outstanding balance, deposit coverage.
	it("getFinancialHealth: computes refund rate from payments vs refunds", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_fin";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));
		const bookingId = await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-01",
				totalAmountCents: 100000n,
				balanceDueCents: 0n,
				depositAmountCents: 100000n,
			}),
		);
		// Seed a succeeded payment + a succeeded refund for that booking
		const paymentId = await t.run(async (ctx: any) => {
			const id = await ctx.db.insert("payments", {
				organizationId: orgId,
				bookingId,
				amountCents: 100000n,
				currency: "USD",
				status: "succeeded",
				provider: "stripe",
				stripePaymentIntentId: "pi_fin_001",
				createdAt: Date.parse("2026-08-01T10:00:00Z"),
				updatedAt: Date.parse("2026-08-01T10:00:00Z"),
			});
			await ctx.db.insert("refunds", {
				organizationId: orgId,
				paymentId: id,
				bookingId,
				amountCents: 20000n,
				currency: "USD",
				stripeRefundId: "re_fin_001",
				status: "succeeded",
				refundedAt: Date.parse("2026-08-02T10:00:00Z"),
				metadata: {},
				createdAt: Date.parse("2026-08-02T10:00:00Z"),
				updatedAt: Date.parse("2026-08-02T10:00:00Z"),
			});
			return id;
		});
		// paymentId is referenced for clarity; the row is in place
		void paymentId;

		const fh = await t.query(
			internal.analytics.getFinancialHealthInternal,
			{
				organizationId: orgId,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);

		// 20% refund rate ($200 / $1000)
		expect(fh.grossCents).toBe(100000);
		expect(fh.refundCents).toBe(20000);
		expect(fh.refundRate).toBe(20);
		// Outstanding: 0 (booking has balanceDueCents = 0)
		expect(fh.outstandingCents).toBe(0);
		// 100% deposit coverage (1 booking, deposit > 0)
		expect(fh.bookingsTotal).toBe(1);
		expect(fh.bookingsWithDeposit).toBe(1);
		expect(fh.depositCoverage).toBe(100);
	});

	it("getFinancialHealth: outstanding balance aggregates across active bookings", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_out";
		const tourId = await t.run((ctx: any) => seedTour(ctx, orgId));
		const custId = await t.run((ctx: any) => seedCustomer(ctx, orgId));

		// 3 confirmed bookings, $50 outstanding each
		for (let i = 0; i < 3; i++) {
			await t.run((ctx: any) =>
				seedBooking(ctx, orgId, tourId, custId, {
					date: "2026-08-01",
					totalAmountCents: 10000n,
					balanceDueCents: 5000n,
					depositAmountCents: 5000n,
				}),
			);
		}
		// 1 cancelled booking — must NOT count
		await t.run((ctx: any) =>
			seedBooking(ctx, orgId, tourId, custId, {
				date: "2026-08-02",
				totalAmountCents: 10000n,
				balanceDueCents: 99999n,
				depositAmountCents: 0n,
				status: "cancelled",
			}),
		);

		const fh = await t.query(
			internal.analytics.getFinancialHealthInternal,
			{
				organizationId: orgId,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);

		// 3 × $50 = $150 outstanding, deposit coverage 100%
		expect(fh.outstandingCents).toBe(15000);
		expect(fh.bookingsTotal).toBe(3);
		expect(fh.bookingsWithDeposit).toBe(3);
		expect(fh.depositCoverage).toBe(100);
	});

	it("getFinancialHealth: empty org returns zeros (no division by zero)", async () => {
		const t = convexTest(schema, modules);
		const fh = await t.query(
			internal.analytics.getFinancialHealthInternal,
			{
				organizationId: "org_fin_empty",
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);
		expect(fh.refundRate).toBe(0);
		expect(fh.depositCoverage).toBe(0);
		expect(fh.outstandingCents).toBe(0);
		expect(fh.grossCents).toBe(0);
	});

	// Tier 4: getConversions — public-booking funnel.
	it("getConversions: aggregates outcomes into success rate", async () => {
		const t = convexTest(schema, modules);
		const orgId = "org_conv";
		// 5 success, 2 rate-limited, 1 validation, 2 capacity, 0 unknown-slug
		const outcomes = [
			"success",
			"success",
			"success",
			"success",
			"success",
			"rejected_rate_limit",
			"rejected_rate_limit",
			"rejected_validation",
			"rejected_capacity",
			"rejected_capacity",
		];
		await t.run(async (ctx: any) => {
			for (let i = 0; i < outcomes.length; i++) {
				await ctx.db.insert("publicBookingAttempts", {
					organizationId: orgId,
					email: `guest${i}@example.com`,
					ip: "127.0.0.1",
					outcome: outcomes[i],
					slug: "test-tour",
					createdAt: Date.parse("2026-08-15T10:00:00Z") + i * 1000,
				});
			}
		});

		const conv = await t.query(
			internal.analytics.getConversionsInternal,
			{
				organizationId: orgId,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);

		expect(conv.totalAttempts).toBe(10);
		expect(conv.success).toBe(5);
		expect(conv.rejectedRateLimit).toBe(2);
		expect(conv.rejectedValidation).toBe(1);
		expect(conv.rejectedCapacity).toBe(2);
		expect(conv.rejectedUnknownSlug).toBe(0);
		expect(conv.successRate).toBe(50);
	});

	it("getConversions: tenant isolation — other org's attempts invisible", async () => {
		const t = convexTest(schema, modules);
		const orgA = "org_conv_a";
		const orgB = "org_conv_b";
		await t.run(async (ctx: any) => {
			await ctx.db.insert("publicBookingAttempts", {
				organizationId: orgA,
				email: "a@x.com",
				ip: "127.0.0.1",
				outcome: "success",
				slug: "ta",
				createdAt: Date.parse("2026-08-15T10:00:00Z"),
			});
			await ctx.db.insert("publicBookingAttempts", {
				organizationId: orgB,
				email: "b@x.com",
				ip: "127.0.0.1",
				outcome: "success",
				slug: "tb",
				createdAt: Date.parse("2026-08-15T10:00:00Z"),
			});
		});

		const aConv = await t.query(
			internal.analytics.getConversionsInternal,
			{
				organizationId: orgA,
				startDate: "2026-08-01",
				endDate: "2026-08-31",
			},
		);
		expect(aConv.totalAttempts).toBe(1);
		expect(aConv.success).toBe(1);
	});

	it("getConversions: invalid dates don't crash", async () => {
		const t = convexTest(schema, modules);
		const conv = await t.query(
			internal.analytics.getConversionsInternal,
			{
				organizationId: "org_bad",
				startDate: "not-a-date",
				endDate: "also-not-a-date",
			},
		);
		expect(conv.totalAttempts).toBe(0);
		expect(conv.successRate).toBe(0);
	});
});
