// Analytics queries: overview, tour/guide stats, daily breakdown, revenue.
//
// All queries derive `organizationId` from the caller's session via
// `requireMembership(ctx)` — they do NOT accept it as an arg, to prevent
// cross-tenant data leaks. (Source: backend/tours/services/analytics_service.py,
// backend/tours/services/tour_analytics_service.py,
// backend/tours/routers/staff/analytics.py)
//
// SECURITY: This module was previously vulnerable to IDOR — the
// `organizationId` arg was accepted verbatim with no authz check.
// See CRITICAL #1 in the audit log.
//
// For each public query there is an `internal*` mirror that takes
// `organizationId` directly. The internal versions are used by tests
// (where there is no auth session) and by other internal mutations
// that already have a verified orgId. They MUST NOT be exposed to
// the client.

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireMembership } from "./lib/authz";

// ---- helpers ----

function dateRange(start: string, end: string): string[] {
	const dates: string[] = [];
	let d = start;
	while (d <= end) {
		dates.push(d);
		// advance by 1 day
		const next = new Date(Date.parse(d) + 86_400_000);
		d = next.toISOString().slice(0, 10);
	}
	return dates;
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

// ---- shared builders (no auth, no ctx-bound) ----
//
// Each builder takes the raw data it needs and returns the response.
// The public query and its internal mirror both call the same builder
// so the logic stays in one place.

async function buildOverview(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Run independent queries in parallel. The tours list and the
	// assignments range scan and the pending vacations count don't
	// depend on each other — serializing them was adding ~3x
	// latency to the analytics overview query. Bound each scan to
	// prevent OOM on large orgs — the FE can render 1000s of data
	// points but not millions.
	const MAX_ANALYTICS_SCAN = 10_000;
	const [tours, allAssignments, pendingVacations] = await Promise.all([
		ctx.db
			.query("tours")
			.withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q: any) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("vacationRequests")
			.withIndex("by_org_status", (q: any) =>
				q.eq("organizationId", orgId).eq("status", "pending"),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);
	const activeTours = tours.filter((t: any) => !t.deletedAt);

	const inRange = allAssignments.filter((a: any) => !a.deletedAt);
	const completed = inRange.filter(
		(a: any) => a.status === "completed",
	).length;
	const cancelled = inRange.filter(
		(a: any) => a.status === "cancelled",
	).length;
	const total = inRange.length;
	const completionRate = total > 0 ? round1((completed / total) * 100) : 0;

	const daysInRange = dateRange(startDate, endDate).length;
	const avgPerDay = daysInRange > 0 ? round1(total / daysInRange) : 0;

	const today = new Date().toISOString().slice(0, 10);
	const weekEnd = new Date(Date.parse(today) + 7 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const upcoming = allAssignments.filter(
		(a: any) =>
			a.date >= today &&
			a.date <= weekEnd &&
			a.status === "scheduled" &&
			!a.deletedAt,
	).length;

	let totalGuides = 0;
	try {
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const memberList = await auth.api.listMembers({
			headers,
			query: { organizationId: orgId },
		});
		totalGuides = memberList.members.filter(
			(m: { role: string }) => m.role === "guide",
		).length;
	} catch {
		totalGuides = 0;
	}

	return {
		totalTours: activeTours.length,
		totalGuides,
		totalAssignments: total,
		completedAssignments: completed,
		cancelledAssignments: cancelled,
		pendingVacations: pendingVacations.length,
		upcomingThisWeek: upcoming,
		completionRate,
		averagePerDay: avgPerDay,
	};
}

async function buildTourStats(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scans to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const [tours, assignments] = await Promise.all([
		ctx.db
			.query("tours")
			.withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q: any) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);

	const inRange = assignments.filter((a: any) => !a.deletedAt);

	return tours
		.filter((t: any) => !t.deletedAt)
		.map((tour: any) => {
			const tourAssignments = inRange.filter(
				(a: any) => a.tourId === tour._id,
			);
			return {
				tourId: tour._id,
				tourName: tour.name,
				totalAssignments: tourAssignments.length,
				completed: tourAssignments.filter(
					(a: any) => a.status === "completed",
				).length,
				cancelled: tourAssignments.filter(
					(a: any) => a.status === "cancelled",
				).length,
			};
		})
		.sort((a: any, b: any) => b.totalAssignments - a.totalAssignments)
		.slice(0, 10);
}

async function buildGuideStats(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const assignments = await ctx.db
		.query("assignments")
		.withIndex("by_org_date", (q: any) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = assignments.filter((a: any) => !a.deletedAt);

	const guideMap = new Map<
		string,
		{ total: number; completed: number; cancelled: number }
	>();
	for (const a of inRange) {
		const key = a.guideId ?? "unassigned";
		const entry = guideMap.get(key) ?? { total: 0, completed: 0, cancelled: 0 };
		entry.total++;
		if (a.status === "completed") entry.completed++;
		if (a.status === "cancelled") entry.cancelled++;
		guideMap.set(key, entry);
	}

	return Array.from(guideMap.entries())
		.map(([guideId, stats]) => ({
			guideId,
			guideName: guideId === "unassigned" ? "Unassigned" : guideId,
			totalAssignments: stats.total,
			completed: stats.completed,
			cancelled: stats.cancelled,
		}))
		.sort((a: any, b: any) => b.totalAssignments - a.totalAssignments)
		.slice(0, 10);
}

async function buildDailyStats(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const assignments = await ctx.db
		.query("assignments")
		.withIndex("by_org_date", (q: any) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = assignments.filter((a: any) => !a.deletedAt);

	const dayMap = new Map<
		string,
		{ total: number; completed: number; cancelled: number }
	>();
	for (const d of dateRange(startDate, endDate)) {
		dayMap.set(d, { total: 0, completed: 0, cancelled: 0 });
	}
	for (const a of inRange) {
		const entry = dayMap.get(a.date);
		if (entry) {
			entry.total++;
			if (a.status === "completed") entry.completed++;
			if (a.status === "cancelled") entry.cancelled++;
		}
	}

	return Array.from(dayMap.entries()).map(([date, stats]) => ({
		date,
		total: stats.total,
		completed: stats.completed,
		cancelled: stats.cancelled,
	}));
}

async function buildRevenueSummary(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Range-scan within the org + date window to avoid a full-table
	// collect. by_org_date is leading (orgId, date) so gte/lte work.
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const allBookingsInRange = await ctx.db
		.query("bookings")
		.withIndex("by_org_date", (q: any) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = allBookingsInRange.filter(
		(b: any) => b.status !== "cancelled",
	);

	const totalBookings = inRange.length;
	const totalGuests = inRange.reduce((sum: number, b: any) => sum + b.guests, 0);
	const totalRevenue = inRange.reduce(
		(sum: number, b: any) => sum + Number(b.totalAmountCents),
		0,
	);
	// `cancelled` requires a second pass — the inRange filter above
	// already dropped them.
	const cancelled = allBookingsInRange.filter(
		(b: any) => b.status === "cancelled",
	).length;
	const cancellationRate =
		totalBookings + cancelled > 0
			? round1((cancelled / (totalBookings + cancelled)) * 100)
			: 0;
	const avgBookingValue =
		totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

	return {
		periodStart: startDate,
		periodEnd: endDate,
		totalBookings,
		totalGuests,
		totalRevenueCents: totalRevenue,
		avgBookingValueCents: avgBookingValue,
		cancellationRate,
	};
}

async function buildTopTours(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
	limit: number,
) {
	// Bound the scans to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const [tours, bookings] = await Promise.all([
		ctx.db
			.query("tours")
			.withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("bookings")
			.withIndex("by_org_date", (q: any) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);
	const tourMap = new Map(tours.map((t: any) => [String(t._id), t.name]));

	const inRange = bookings.filter((b: any) => b.status !== "cancelled");

	const tourRevenue = new Map<
		string,
		{ bookings: number; guests: number; revenue: number }
	>();
	for (const b of inRange) {
		const key = String(b.tourId);
		const entry = tourRevenue.get(key) ?? { bookings: 0, guests: 0, revenue: 0 };
		entry.bookings++;
		entry.guests += b.guests;
		entry.revenue += Number(b.totalAmountCents);
		tourRevenue.set(key, entry);
	}

	return Array.from(tourRevenue.entries())
		.map(([tourId, stats]) => ({
			tourId,
			tourName: tourMap.get(tourId) ?? "Unknown",
			totalBookings: stats.bookings,
			totalGuests: stats.guests,
			totalRevenueCents: stats.revenue,
		}))
		.sort((a: any, b: any) => b.totalRevenueCents - a.totalRevenueCents)
		.slice(0, limit);
}

async function buildBookingSources(
	ctx: any,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const bookings = await ctx.db
		.query("bookings")
		.withIndex("by_org_date", (q: any) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = bookings;

	const sourceMap = new Map<string, { bookings: number; guests: number }>();
	for (const b of inRange) {
		const source = b.source ?? "direct";
		const entry = sourceMap.get(source) ?? { bookings: 0, guests: 0 };
		entry.bookings++;
		entry.guests += b.guests;
		sourceMap.set(source, entry);
	}

	return Array.from(sourceMap.entries())
		.map(([source, stats]) => ({
			source,
			totalBookings: stats.bookings,
			totalGuests: stats.guests,
		}))
		.sort((a: any, b: any) => b.totalBookings - a.totalBookings);
}

// ---- public queries (auth via requireMembership) ----

export const getOverview = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildOverview(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

export const getTourStats = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildTourStats(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

export const getGuideStats = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildGuideStats(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

export const getDailyStats = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildDailyStats(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

export const getRevenueSummary = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildRevenueSummary(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

export const getTopTours = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildTopTours(
			ctx,
			member.organizationId,
			args.startDate,
			args.endDate,
			args.limit ?? 10,
		);
	},
});

/**
 * @internal
 * No FE caller. The analytics page derives source counts from the
 * `getOverview` query instead. The internal mirror is used by tests.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const getBookingSources = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildBookingSources(ctx, member.organizationId, args.startDate, args.endDate);
	},
});

// ---- internal queries (for tests + internal callers) ----
//
// These accept organizationId directly. They MUST NOT be exposed to
// the client (no API surface in `api.*`).

export const getOverviewInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildOverview(ctx, args.organizationId, args.startDate, args.endDate),
});

export const getTourStatsInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildTourStats(ctx, args.organizationId, args.startDate, args.endDate),
});

export const getGuideStatsInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildGuideStats(ctx, args.organizationId, args.startDate, args.endDate),
});

export const getDailyStatsInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildDailyStats(ctx, args.organizationId, args.startDate, args.endDate),
});

export const getRevenueSummaryInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildRevenueSummary(ctx, args.organizationId, args.startDate, args.endDate),
});

export const getTopToursInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) =>
		buildTopTours(
			ctx,
			args.organizationId,
			args.startDate,
			args.endDate,
			args.limit ?? 10,
		),
});

export const getBookingSourcesInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildBookingSources(ctx, args.organizationId, args.startDate, args.endDate),
});
