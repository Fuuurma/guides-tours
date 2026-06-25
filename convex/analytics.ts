// Analytics queries: overview, tour/guide stats, daily breakdown, revenue.
//
// Source: backend/tours/services/analytics_service.py (120 lines)
//         backend/tours/services/tour_analytics_service.py (250 lines)
//         backend/tours/routers/staff/analytics.py (100 lines)

import { v } from "convex/values";
import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

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

// ---- overview ----

export const getOverview = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const orgId = args.organizationId;
		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.collect();
		const activeTours = tours.filter((t) => !t.deletedAt);

		const allAssignments = await ctx.db
			.query("assignments")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId))
			.collect();
		const inRange = allAssignments.filter(
			(a) =>
				a.date >= args.startDate &&
				a.date <= args.endDate &&
				!a.deletedAt,
		);
		const completed = inRange.filter((a) => a.status === "completed").length;
		const cancelled = inRange.filter((a) => a.status === "cancelled").length;
		const total = inRange.length;
		const completionRate = total > 0 ? round1((completed / total) * 100) : 0;

		const daysInRange = dateRange(args.startDate, args.endDate).length;
		const avgPerDay = daysInRange > 0 ? round1(total / daysInRange) : 0;

		// Upcoming this week
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

		// Pending vacations
		const pendingVacations = await ctx.db
			.query("vacationRequests")
			.withIndex("by_org_status", (q) =>
				q
					.eq("organizationId", orgId)
					.eq("status", "pending"),
			)
			.collect();

		// Count active guides via Better Auth org membership.
		// If auth is not available (e.g., in tests), default to 0.
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
			// No auth context (tests / public callers)
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
	},
});

// ---- tour stats ----

export const getTourStats = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		const assignments = await ctx.db
			.query("assignments")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		const inRange = assignments.filter(
			(a) =>
				a.date >= args.startDate &&
				a.date <= args.endDate &&
				!a.deletedAt,
		);

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
					completed: tourAssignments.filter((a) => a.status === "completed")
						.length,
					cancelled: tourAssignments.filter((a) => a.status === "cancelled")
						.length,
				};
			})
			.sort((a, b) => b.totalAssignments - a.totalAssignments)
			.slice(0, 10);
	},
});

// ---- guide stats ----

export const getGuideStats = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const assignments = await ctx.db
			.query("assignments")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		const inRange = assignments.filter(
			(a) =>
				a.date >= args.startDate &&
				a.date <= args.endDate &&
				!a.deletedAt,
		);

		const guideMap = new Map<
			string,
			{ total: number; completed: number; cancelled: number }
		>();
		for (const a of inRange) {
			const key = a.guideId ?? "unassigned";
			const entry = guideMap.get(key) ?? {
				total: 0,
				completed: 0,
				cancelled: 0,
			};
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
	},
});

// ---- daily stats ----

export const getDailyStats = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const assignments = await ctx.db
			.query("assignments")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		const inRange = assignments.filter(
			(a) =>
				a.date >= args.startDate &&
				a.date <= args.endDate &&
				!a.deletedAt,
		);

		const dayMap = new Map<
			string,
			{ total: number; completed: number; cancelled: number }
		>();
		for (const d of dateRange(args.startDate, args.endDate)) {
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
	},
});

// ---- revenue summary ----

export const getRevenueSummary = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.collect();

		const inRange = bookings.filter(
			(b) =>
				b.date >= args.startDate &&
				b.date <= args.endDate &&
				b.status !== "cancelled",
		);

		const totalBookings = inRange.length;
		const totalGuests = inRange.reduce((sum, b) => sum + b.guests, 0);
		const totalRevenue = inRange.reduce(
			(sum, b) => sum + Number(b.totalAmountCents),
			0,
		);
		const cancelled = inRange.filter((b) => b.status === "cancelled").length;
		const cancellationRate =
			totalBookings > 0
				? round1((cancelled / (totalBookings + cancelled)) * 100)
				: 0;
		const avgBookingValue =
			totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

		return {
			periodStart: args.startDate,
			periodEnd: args.endDate,
			totalBookings,
			totalGuests,
			totalRevenueCents: totalRevenue,
			avgBookingValueCents: avgBookingValue,
			cancellationRate,
		};
	},
});

// ---- top tours by revenue ----

export const getTopTours = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();
		const tourMap = new Map(tours.map((t) => [String(t._id), t.name]));

		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.collect();

		const inRange = bookings.filter(
			(b) =>
				b.date >= args.startDate &&
				b.date <= args.endDate &&
				b.status !== "cancelled",
		);

		const tourRevenue = new Map<
			string,
			{ bookings: number; guests: number; revenue: number }
		>();
		for (const b of inRange) {
			const key = String(b.tourId);
			const entry = tourRevenue.get(key) ?? {
				bookings: 0,
				guests: 0,
				revenue: 0,
			};
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
			.slice(0, args.limit ?? 10);
	},
});

// ---- booking sources ----

export const getBookingSources = query({
	args: {
		organizationId: v.string(),
		startDate: v.string(),
		endDate: v.string(),
	},
	handler: async (ctx, args) => {
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_org", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.collect();

		const inRange = bookings.filter(
			(b) =>
				b.date >= args.startDate &&
				b.date <= args.endDate,
		);

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
	},
});
