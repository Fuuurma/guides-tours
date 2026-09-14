/**
 * Analytics payload builders (fleet 2d41eaaa slice 1 — lib-extraction
 * precedent from bookings.ts 2cf9bcf): ctx-bound functions that run the
 * reads and compute the report shapes. The Convex query wrappers stay
 * in convex/analytics.ts — the client-facing api surface is identical.
 */
import { authComponent, createAuth } from "../auth";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { logger } from "../lib/logger";

type QCtx = GenericQueryCtx<DataModel>;
type Booking = Doc<"bookings">;

export function dateRange(start: string, end: string): string[] {
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

export function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

export async function buildOverview(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Run independent queries in parallel. The tours list and the
	// assignments range scan and the pending vacations count don't
	// depend on each other — serializing them was adding ~3x
	// latency to the analytics overview query. Each scan probes
	// CAP+1 rows: hitting the cap means the org has more rows than
	// were read, which the payload reports as truncated (fleet
	// needs-work 09-08, devin finding on silent take(N) caps).
	const MAX_ANALYTICS_SCAN = 10_000;
	// The upcoming-week card needs FUTURE rows, but the window scan
	// below is clipped at endDate (every dashboard preset ends today),
	// so filtering it could only ever count today (fleet needs-work
	// 09-13 P2). Dedicated 7-day scan — inherently bounded, cheap.
	const todayEarly = new Date().toISOString().slice(0, 10);
	const weekEndEarly = new Date(Date.parse(todayEarly) + 7 * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const [tours, allAssignments, pendingVacations, upcomingWeek] = await Promise.all([
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
		ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", todayEarly)
					.lte("date", weekEndEarly),
			)
			.take(MAX_ANALYTICS_SCAN),
	]);
	const truncated = [tours, allAssignments, pendingVacations, upcomingWeek].some(
		(rows) => rows.length >= MAX_ANALYTICS_SCAN,
	);
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

	// Counted from the dedicated 7-day scan above (same anchors),
	// not the window-clipped array — see the scan comment.
	const upcoming = upcomingWeek.filter(
		(a) =>
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
	} catch (err) {
		// A real Better Auth/component failure must not be
		// indistinguishable from an org with zero guides (fleet
		// 10b56a45) — log with context, keep the 0 fallback.
		logger.error(
			`[analytics] listMembers failed for org ${orgId}: ` +
				(err instanceof Error ? err.message : String(err)),
		);
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
		truncated,
	};
}

export async function buildTourStats(
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

	// Overflow probe (fleet 09-08): a full-cap scan means the org has
	// more rows than were read — flag the payload as truncated (and
	// keep the warn log so cap-hits stay visible server-side).
	const tourCount = tours.length;
	const assignmentCount = assignments.length;
	const truncated = tourCount >= MAX_ANALYTICS_SCAN || assignmentCount >= MAX_ANALYTICS_SCAN;
	if (truncated) {
		logger.warn(
			`[analytics.buildTourStats] 10k scan cap hit for org ${orgId} — stats undercount for this range`,
		);
	}

	const tourItems = tours
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
	return { tours: tourItems, truncated };
}

export async function buildGuideStats(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Bound the scan to prevent OOM on large orgs. Hitting the cap
	// means the org has more rows than were read — reported as
	// truncated (fleet needs-work 09-08, silent take(N) caps).
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
	const truncated = assignments.length >= MAX_ANALYTICS_SCAN;

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

	const guides = Array.from(guideMap.entries())
		.map(([guideId, stats]) => ({
			guideId,
			totalAssignments: stats.total,
			completed: stats.completed,
			cancelled: stats.cancelled,
		}))
		.sort((a, b) => b.totalAssignments - a.totalAssignments)
		.slice(0, 10);
	// Uniform shape with buildDailyStats/buildChannelRevenue: the
	// list rides `guides`, the cap-hit rides `truncated`.
	return { guides, truncated };
}

export async function buildDailyStats(
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

	return {
		days: Array.from(dayMap.entries()).map(([date, stats]) => ({
			date,
			total: stats.total,
			completed: stats.completed,
			cancelled: stats.cancelled,
		})),
		truncated: assignments.length >= MAX_ANALYTICS_SCAN,
	};
}

export async function buildRevenueSummary(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
) {
	// Range-scan within the org + date window to avoid a full-table
	// collect. by_org_date is leading (orgId, date) so gte/lte work.
	// Bound the scan to prevent OOM on large orgs. Hitting the cap
	// means the org has more rows than were read — reported as
	// truncated (fleet needs-work 09-08, silent take(N) caps).
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
	const truncated = allBookingsInRange.length >= MAX_ANALYTICS_SCAN;

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
		truncated,
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
export async function buildChannelRevenue(
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
	// Hitting the cap means the org has more rows than were read —
	// reported as truncated (fleet needs-work 09-08, silent take(N)
	// caps).
	const truncated = bookings.length >= MAX_ANALYTICS_SCAN;

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

	return {
		channels: Array.from(channelMap.entries())
			.map(([source, stats]) => ({
				source,
				totalBookings: stats.bookings,
				totalGuests: stats.guests,
				totalRevenueCents: stats.revenue,
			}))
			.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents),
		truncated,
	};
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
export async function buildFinancialHealth(
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
					.eq("status", "succeeded")
					.gte("createdAt", Date.parse(`${startDate}T00:00:00Z`))
					.lte("createdAt", Date.parse(`${endDate}T23:59:59Z`)),
			)
			.take(MAX_ANALYTICS_SCAN),
		ctx.db
			.query("refunds")
			.withIndex("by_org_status_created", (q) =>
				q
					.eq("organizationId", orgId)
					.eq("status", "succeeded")
					.gte("createdAt", Date.parse(`${startDate}T00:00:00Z`))
					.lte("createdAt", Date.parse(`${endDate}T23:59:59Z`)),
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
	// Hitting any cap means the org has more rows than were read —
	// reported as truncated (fleet needs-work 09-13 P3).
	const truncated = [payments, refunds, bookings].some(
		(rows) => rows.length >= MAX_ANALYTICS_SCAN,
	);

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
		truncated,
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
export async function buildConversions(
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
			truncated: false,
		};
	}
	const rows = await ctx.db
		.query("publicBookingAttempts")
		.withIndex("by_org_created", (q) =>
			q
				.eq("organizationId", orgId)
				.gte("createdAt", startMs)
				.lte("createdAt", endMs),
		)
		.take(MAX_ANALYTICS_SCAN);
	// Hitting the cap means more attempts than were read — reported
	// as truncated (fleet needs-work 09-13 P3, silent take(N) caps).
	const truncated = rows.length >= MAX_ANALYTICS_SCAN;

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
		truncated,
	};
}

export async function buildTopTours(
	ctx: QCtx,
	orgId: string,
	startDate: string,
	endDate: string,
	limit: number,
) {
	// Bound the scans to prevent OOM on large orgs. Hitting either
	// cap means the org has more rows than were read — reported as
	// truncated (fleet needs-work 09-08/09-13, silent take(N) caps).
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
	const truncated =
		tours.length >= MAX_ANALYTICS_SCAN ||
		bookings.length >= MAX_ANALYTICS_SCAN;
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

	return {
		tours: Array.from(tourRevenue.entries())
			.map(([tourId, stats]) => ({
				tourId,
				tourName: tourMap.get(tourId) ?? "Unknown",
				totalBookings: stats.bookings,
				totalGuests: stats.guests,
				totalRevenueCents: stats.revenue,
			}))
			.sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
			.slice(0, limit),
		truncated,
	};
}

/**
 * Live period stats for a single tour (bookings + assignments).
 * Used by tour detail; complements the org-wide getTourStats list.
 */
export async function buildForTour(
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

export async function buildBookingSources(
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

export async function buildWeeklyPulse(
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
