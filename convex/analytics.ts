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
import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireMembership } from "./lib/authz";

// Type aliases for the document shapes we work with. These come
// straight from the generated DataModel — no `any` needed.
type QCtx = GenericQueryCtx<DataModel>;
type Booking = Doc<"bookings">;

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
	ctx: QCtx,
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
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("vacationRequests")
			.withIndex("by_org_status", (q) =>
				q.eq("organizationId", orgId).eq("status", "pending"),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);
	const activeTours = tours.filter((t) => !t.deletedAt);

	const inRange = allAssignments.filter((a) => !a.deletedAt);
	const completed = inRange.filter(
		(a) => a.status === "completed",
	).length;
	const cancelled = inRange.filter(
		(a) => a.status === "cancelled",
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
		(a) =>
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
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scans to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const [tours, assignments] = await Promise.all([
		ctx.db
			.query("tours")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);

	const inRange = assignments.filter((a) => !a.deletedAt);

	return tours
		.filter((t) => !t.deletedAt)
		.map((tour) => {
			const tourAssignments = inRange.filter(
				(a) => a.tourId === tour._id,
			);
			return {
				tourId: tour._id,
				tourName: tour.name,
				totalAssignments: tourAssignments.length,
				completed: tourAssignments.filter(
					(a) => a.status === "completed",
				).length,
				cancelled: tourAssignments.filter(
					(a) => a.status === "cancelled",
				).length,
			};
		})
		.sort((a, b) => b.totalAssignments - a.totalAssignments)
		.slice(0, 10);
}

async function buildGuideStats(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const assignments = await ctx.db
		.query("assignments")
		.withIndex("by_org_date", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = assignments.filter((a) => !a.deletedAt);

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
		.sort((a, b) => b.totalAssignments - a.totalAssignments)
		.slice(0, 10);
}

async function buildDailyStats(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const assignments = await ctx.db
		.query("assignments")
		.withIndex("by_org_date", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = assignments.filter((a) => !a.deletedAt);

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
	ctx: QCtx,
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
		.withIndex("by_org_date", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const inRange = allBookingsInRange.filter(
		(b) => b.status !== "cancelled",
	);

	const totalBookings = inRange.length;
	const totalGuests = inRange.reduce((sum: number, b: Booking) => sum + b.guests, 0);
	const totalRevenue = inRange.reduce(
		(sum: number, b: Booking) => sum + Number(b.totalAmountCents),
		0,
	);
	// `cancelled` requires a second pass — the inRange filter above
	// already dropped them.
	const cancelled = allBookingsInRange.filter(
		(b) => b.status === "cancelled",
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

/**
 * Revenue + booking count + guests, broken down by booking source.
 * Uses the `by_org_date` compound index (range-scannable on date).
 * We need *all* sources aggregated, so the right index here is the
 * date-leading one — `by_org_source_date` would require binding
 * `source` first and then making one query per source.
 *
 * Excludes cancelled bookings so the revenue totals line up with
 * the gross-revenue card on the analytics page.
 *
 * Returns rows sorted by revenue descending. `source` is whatever
 * the booking row has in its `source` field (viator, getyourguide,
 * direct, etc.) — falls back to "direct" for legacy rows that
 * pre-date the field.
 */
async function buildChannelRevenue(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const MAX_ANALYTICS_SCAN = 10_000;
	const bookings = await ctx.db
		.query("bookings")
		.withIndex("by_org_date", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("date", startDate)
				.lte("date", endDate),
		)
		.take(MAX_ANALYTICS_SCAN);

	const active = bookings.filter((b) => b.status !== "cancelled");

	const channelMap = new Map<
		string,
		{ bookings: number; guests: number; revenue: number }
	>();
	for (const b of active) {
		const source = b.source ?? "direct";
		const entry = channelMap.get(source) ?? {
			bookings: 0,
			guests: 0,
			revenue: 0,
		};
		entry.bookings++;
		entry.guests += b.guests;
		entry.revenue += Number(b.totalAmountCents);
		channelMap.set(source, entry);
	}

	return Array.from(channelMap.entries())
		.map(([source, stats]) => ({
			source,
			totalBookings: stats.bookings,
			totalGuests: stats.guests,
			totalRevenueCents: stats.revenue,
		}))
		.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
}

/**
 * Tier 4: Financial-health trio for the analytics page. Three
 * numbers operators care about but no existing query surfaces:
 *
 *   1. Refund rate       — sum of refund amounts vs gross payments
 *                          in the window (succeeded payments only).
 *   2. Outstanding       — sum of balanceDueCents for active
 *                          bookings created in the window.
 *   3. Deposit coverage  — share of bookings in the window that
 *                          have a deposit paid. Tells the operator
 *                          whether their deposit policy is being
 *                          honored.
 *
 * Bound to MAX_ANALYTICS_SCAN per query (10K) so a busy org
 * doesn't OOM. All three scans run in parallel since they
 * touch distinct tables.
 */
async function buildFinancialHealth(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const MAX_ANALYTICS_SCAN = 10_000;
	const [payments, refunds, bookings] = await Promise.all([
		ctx.db
			.query("payments")
			.withIndex("by_org_status_created", (q) =>
				q
					.eq("organizationId", orgId)
					.eq("status", "succeeded"),
			)
			.filter((q) =>
				q.and(
					q.gte(q.field("createdAt"), Date.parse(`${startDate}T00:00:00Z`)),
					q.lte(q.field("createdAt"), Date.parse(`${endDate}T23:59:59Z`)),
				),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("refunds")
			.withIndex("by_org_status", (q) =>
				q
					.eq("organizationId", orgId)
					.eq("status", "succeeded"),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("bookings")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);

	const grossCents = payments.reduce(
		(s, p) => s + Number(p.amountCents),
		0,
	);
	const refundCents = refunds.reduce(
		(s, r) => s + Number(r.amountCents),
		0,
	);
	const refundRate =
		grossCents > 0 ? round1((refundCents / grossCents) * 100) : 0;

	const activeBookings = bookings.filter((b) => b.status !== "cancelled");
	const outstandingCents = activeBookings.reduce(
		(s, b) => s + Number(b.balanceDueCents),
		0,
	);
	const bookingsWithDeposit = activeBookings.filter(
		(b) => Number(b.depositAmountCents) > 0,
	).length;
	const depositCoverage =
		activeBookings.length > 0
			? round1((bookingsWithDeposit / activeBookings.length) * 100)
			: 0;

	return {
		startDate,
		endDate,
		grossCents,
		refundCents,
		refundRate,
		outstandingCents,
		bookingsTotal: activeBookings.length,
		bookingsWithDeposit,
		depositCoverage,
	};
}

/**
 * Tier 4: public-booking funnel for the active org. Counts
 * `publicBookingAttempts` rows in the window by `outcome` and
 * returns a per-bucket breakdown + the success rate.
 *
 * The schema captures every attempt (successful + rejected) so
 * this query exposes the operator's *true* conversion rate —
 * not just bookings created, but attempts that actually got a
 * guest through the rate limit + capacity + validation wall.
 *
 * `by_org_created` is the index we use; rows whose
 * `organizationId` is null (unknown-slug attempts) are skipped
 * via the filter, so each org only sees its own funnel.
 */
async function buildConversions(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const MAX_ANALYTICS_SCAN = 10_000;
	const startMs = Date.parse(`${startDate}T00:00:00Z`);
	const endMs = Date.parse(`${endDate}T23:59:59Z`);
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
		return {
			startDate,
			endDate,
			totalAttempts: 0,
			success: 0,
			rejectedRateLimit: 0,
			rejectedValidation: 0,
			rejectedCapacity: 0,
			rejectedUnknownSlug: 0,
			successRate: 0,
		};
	}
	const rows = await ctx.db
		.query("publicBookingAttempts")
		.withIndex("by_org_created", (q) =>
			q.eq("organizationId", orgId),
		)
		.filter((q) =>
			q.and(
				q.gte(q.field("createdAt"), startMs),
				q.lte(q.field("createdAt"), endMs),
			),
		)
		.take(MAX_ANALYTICS_SCAN);

	let success = 0;
	let rejectedRateLimit = 0;
	let rejectedValidation = 0;
	let rejectedCapacity = 0;
	let rejectedUnknownSlug = 0;
	for (const r of rows) {
		switch (r.outcome) {
			case "success":
				success++;
				break;
			case "rejected_rate_limit":
				rejectedRateLimit++;
				break;
			case "rejected_validation":
				rejectedValidation++;
				break;
			case "rejected_capacity":
				rejectedCapacity++;
				break;
			case "rejected_unknown_slug":
				rejectedUnknownSlug++;
				break;
			default:
				break;
		}
	}

	const totalAttempts = rows.length;
	const successRate =
		totalAttempts > 0 ? round1((success / totalAttempts) * 100) : 0;

	return {
		startDate,
		endDate,
		totalAttempts,
		success,
		rejectedRateLimit,
		rejectedValidation,
		rejectedCapacity,
		rejectedUnknownSlug,
		successRate,
	};
}

async function buildTopTours(
	ctx: QCtx,
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
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("bookings")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);
	const tourMap = new Map(tours.map((t) => [String(t._id), t.name]));

	const inRange = bookings.filter((b) => b.status !== "cancelled");

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
		.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
		.slice(0, limit);
}

/**
 * Live period stats for a single tour (bookings + assignments).
 * Used by tour detail; complements the org-wide getTourStats list.
 */
async function buildForTour(
	ctx: QCtx,
	orgId: string,
	tourId: string,
	startDate: string,
	endDate: string,
) {
	const MAX_ANALYTICS_SCAN = 10_000;
	const tour = await ctx.db.get(tourId as Id<"tours">);
	if (!tour || tour.organizationId !== orgId || tour.deletedAt !== undefined) {
		return null;
	}

	const [bookings, assignments] = await Promise.all([
		ctx.db
			.query("bookings")
			.withIndex("by_tour_date", (q) =>
				q
					.eq("tourId", tour._id)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", startDate)
					.lte("date", endDate),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);

	const tourAssignments = assignments.filter(
		(a) => a.tourId === tour._id && !a.deletedAt,
	);
	const activeBookings = bookings.filter((b) => b.status !== "cancelled");
	const cancelled = bookings.filter((b) => b.status === "cancelled").length;
	const totalBookings = activeBookings.length;
	const totalGuests = activeBookings.reduce((s, b) => s + b.guests, 0);
	const totalRevenueCents = activeBookings.reduce(
		(s, b) => s + Number(b.totalAmountCents),
		0,
	);
	const netRevenueCents = activeBookings.reduce(
		(s, b) => s + Number(b.netRevenueCents),
		0,
	);
	const avgGroupSize =
		totalBookings > 0 ? round1(totalGuests / totalBookings) : 0;
	// Capacity × distinct departure days with bookings (simple utilization).
	const departureDays = new Set(activeBookings.map((b) => b.date)).size;
	const totalCapacity = tour.capacity * Math.max(1, departureDays);
	const utilizationRate =
		totalCapacity > 0
			? Math.min(1, round1(totalGuests / totalCapacity))
			: 0;

	return {
		tourId: tour._id,
		tourName: tour.name,
		periodStart: startDate,
		periodEnd: endDate,
		capacity: tour.capacity,
		totalBookings,
		totalGuests,
		totalRevenueCents,
		netRevenueCents,
		cancellations: cancelled,
		avgGroupSize,
		utilizationRate,
		totalCapacity,
		totalAssignments: tourAssignments.length,
		completedAssignments: tourAssignments.filter(
			(a) => a.status === "completed",
		).length,
		cancelledAssignments: tourAssignments.filter(
			(a) => a.status === "cancelled",
		).length,
	};
}

async function buildBookingSources(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs.
	const MAX_ANALYTICS_SCAN = 10_000;
	const bookings = await ctx.db
		.query("bookings")
		.withIndex("by_org_date", (q) =>
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
		.sort((a, b) => b.totalBookings - a.totalBookings);
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

/** Period stats for one tour (tour detail "Recent performance"). */
export const getForTour = query({
	args: {
		tourId: v.id("tours"),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildForTour(
			ctx,
			member.organizationId,
			args.tourId,
			args.startDate,
			args.endDate,
		);
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

/**
 * Revenue + booking count per source channel for the active org
 * in the date window. Powers the channel-mix horizontal bar on
 * `/dashboard/analytics` — replaces the static `<ul>` bookend
 * block. Uses the `by_org_source_date` compound index.
 */
export const getChannelRevenue = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildChannelRevenue(
			ctx,
			member.organizationId,
			args.startDate,
			args.endDate,
		);
	},
});

/**
 * Tier 4: financial-health trio — refund rate, outstanding
 * balance, and deposit coverage for the analytics page.
 */
export const getFinancialHealth = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildFinancialHealth(
			ctx,
			member.organizationId,
			args.startDate,
			args.endDate,
		);
	},
});

/**
 * Tier 4: public-booking funnel — total attempts, success rate,
 * and per-rejection-bucket counts. Powers the conversions widget
 * on `/dashboard/analytics`. Excludes unknown-slug attempts
 * (those don't belong to this org).
 */
export const getConversions = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildConversions(
			ctx,
			member.organizationId,
			args.startDate,
			args.endDate,
		);
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

export const getForTourInternal = internalQuery({
	args: {
		organizationId: v.string(),
		tourId: v.id("tours"),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildForTour(
			ctx,
			args.organizationId,
			args.tourId,
			args.startDate,
			args.endDate,
		),
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

export const getChannelRevenueInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildChannelRevenue(
			ctx,
			args.organizationId,
			args.startDate,
			args.endDate,
		),
});

export const getFinancialHealthInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildFinancialHealth(
			ctx,
			args.organizationId,
			args.startDate,
			args.endDate,
		),
});

export const getConversionsInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildConversions(
			ctx,
			args.organizationId,
			args.startDate,
			args.endDate,
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

// ---- getWeeklyPulse: this-week vs last-week operator pulse ----
//
// One query that gives the home page its four hero numbers:
//   - revenue (USD)
//   - booking count
//   - avg group size
//   - cancellation rate
//
// …each with the prior period as the comparison baseline so the
// card can show "+12%" or "-3 bookings" without a second fetch.
//
// "This week" = `args.startDate`..`args.endDate` (caller picks the
// window — usually the last 7 calendar days). "Last week" = the
// same-length window immediately preceding `args.startDate`. The
// window length is normalized so a caller asking for a 14-day
// range gets a 14-day prior baseline.

async function buildWeeklyPulse(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	const startMs = Date.parse(`${startDate}T00:00:00Z`);
	const endMs = Date.parse(`${endDate}T00:00:00Z`);
	// Guard against bad input so a typo can't trigger a NaN-derived
	// date that lands 50 years in the future.
	if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
		return {
			startDate,
			endDate,
			previousStartDate: startDate,
			previousEndDate: endDate,
			revenueCents: 0,
			bookings: 0,
			guests: 0,
			avgGroupSize: 0,
			cancellationRate: 0,
			previousRevenueCents: 0,
			previousBookings: 0,
			previousGuests: 0,
			previousCancellationRate: 0,
		};
	}
	const windowMs = endMs - startMs;
	const prevEnd = new Date(startMs - 86_400_000).toISOString().slice(0, 10);
	const prevStart = new Date(startMs - windowMs - 86_400_000)
		.toISOString()
		.slice(0, 10);

	// Two range scans in parallel. The two windows never overlap,
	// so a single index scan with two predicates can't beat
	// parallelizing them on the wire — Convex reads are independent
	// transactions. `buildRevenueSummary` already bounds at 10K
	// per window.
	const [current, previous] = await Promise.all([
		buildRevenueSummary(ctx, orgId, startDate, endDate),
		buildRevenueSummary(ctx, orgId, prevStart, prevEnd),
	]);

	return {
		startDate,
		endDate,
		previousStartDate: prevStart,
		previousEndDate: prevEnd,
		revenueCents: current.totalRevenueCents,
		bookings: current.totalBookings,
		guests: current.totalGuests,
		avgGroupSize:
			current.totalBookings > 0
				? round1(current.totalGuests / current.totalBookings)
				: 0,
		cancellationRate: current.cancellationRate,
		previousRevenueCents: previous.totalRevenueCents,
		previousBookings: previous.totalBookings,
		previousGuests: previous.totalGuests,
		previousCancellationRate: previous.cancellationRate,
	};
}

export const getWeeklyPulse = query({
	args: {
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		return await buildWeeklyPulse(
			ctx,
			member.organizationId,
			args.startDate,
			args.endDate,
		);
	},
});

export const getWeeklyPulseInternal = internalQuery({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) =>
		buildWeeklyPulse(ctx, args.organizationId, args.startDate, args.endDate),
});
