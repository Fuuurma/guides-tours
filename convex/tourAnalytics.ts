// Tour analytics cache: pre-computed (period × tour) metrics stored
// for fast dashboard reads. Live period stats live in analytics.ts
// (getForTour / getTopTours); this table stores daily snapshots for
// longer-range trends.
//
// Nightly cron `refresh_tour_analytics` (05:00 UTC) recomputes
// yesterday's daily rows per org that has tours.

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { internal } from "./_generated/api";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { utcYmd, addDaysYmd } from "./lib/staffingGaps";

const MAX_TOURS = 500;
const MAX_BOOKINGS = 5_000;
const MAX_ORGS = 100;
const MAX_TOURS_SCAN = 5_000;

// ---- queries ----

export const list = query({
	args: {
		tourId: v.optional(v.id("tours")),
		periodType: v.optional(v.string()),
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
const orgId = member.organizationId;
		// Bound the result so an org with thousands of analytics
		// rows doesn't OOM the response. The FE page renders at
		// most a few hundred.
		const MAX_ANALYTICS = 1000;
		let all;
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			// tourId is globally unique in Convex so cross-org rows
			// can't actually share an ID, but the explicit filter
			// documents the tenant isolation and keeps the pattern
			// consistent with other modules.
			all = await ctx.db
				.query("tourAnalytics")
				.withIndex("by_tour_period", (q) => q.eq("tourId", args.tourId!))
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.take(MAX_ANALYTICS);
		} else if (args.periodType) {
			// by_org_period leads with (org, periodDate, periodType).
			// Apply the date range at the index level, then filter
			// periodType in JS since it's the trailing field.
			all = await ctx.db
				.query("tourAnalytics")
				.withIndex("by_org_period", (q) => {
					const eq = q
						.eq("organizationId", orgId)
						.gte("periodDate", args.dateFrom ?? "")
						.lte("periodDate", args.dateTo ?? "￿");
					return eq;
				})
				.take(MAX_ANALYTICS);
		} else {
			all = await ctx.db
				.query("tourAnalytics")
				.withIndex("by_org", (q) => q.eq("organizationId", orgId))
				.take(MAX_ANALYTICS);
		}
		return all
			.filter((r) => {
				if (args.periodType && r.periodType !== args.periodType) return false;
				if (args.dateFrom && r.periodDate < args.dateFrom) return false;
				if (args.dateTo && r.periodDate > args.dateTo) return false;
				return true;
			})
			.sort((a, b) => a.periodDate.localeCompare(b.periodDate));
	},
});

export const get = query({
	args: {
		analyticsId: v.id("tourAnalytics"),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const row = await ctx.db.get(args.analyticsId);
		if (!row) throw new ConvexError("Analytics not found");
		if (row.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: analytics belongs to a different organization");
		}
		return row;
	},
});

// ---- mutations ----

export const upsert = mutation({
	args: {
		tourId: v.id("tours"),
		periodDate: v.string(),
		periodType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly"),
		),
		totalBookings: v.number(),
		totalGuests: v.number(),
		grossRevenueCents: v.int64(),
		netRevenueCents: v.int64(),
		cancellations: v.number(),
		noShows: v.number(),
		avgGroupSize: v.number(),
		utilizationRate: v.number(),
		totalCapacity: v.number(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalUpsert as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, ...args },
		);
	},
});

export const internalUpsert = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
		periodDate: v.string(),
		periodType: v.union(
			v.literal("daily"),
			v.literal("weekly"),
			v.literal("monthly"),
		),
		totalBookings: v.number(),
		totalGuests: v.number(),
		grossRevenueCents: v.int64(),
		netRevenueCents: v.int64(),
		cancellations: v.number(),
		noShows: v.number(),
		avgGroupSize: v.number(),
		utilizationRate: v.number(),
		totalCapacity: v.number(),
	},
	handler: async (ctx, args) => {
		if (args.utilizationRate < 0 || args.utilizationRate > 1) {
			throw new ConvexError("utilizationRate must be 0..1");
		}
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}

		const existing = await ctx.db
			.query("tourAnalytics")
			.withIndex("by_tour_period", (q) =>
				q.eq("tourId", args.tourId).eq("periodDate", args.periodDate),
			)
			.first();
		const patch = {
			organizationId: args.organizationId,
			tourId: args.tourId,
			periodDate: args.periodDate,
			periodType: args.periodType,
			totalBookings: args.totalBookings,
			totalGuests: args.totalGuests,
			grossRevenueCents: args.grossRevenueCents,
			netRevenueCents: args.netRevenueCents,
			cancellations: args.cancellations,
			noShows: args.noShows,
			avgGroupSize: args.avgGroupSize,
			utilizationRate: args.utilizationRate,
			totalCapacity: args.totalCapacity,
			calculatedAt: Date.now(),
		};
		if (existing) {
			await ctx.db.patch(existing._id, patch);
			await logAudit(ctx, {
				organizationId: args.organizationId,
				userId: args.userId,
				action: "tourAnalytics.updated",
				resourceType: "tourAnalytics",
				resourceId: existing._id,
				oldValues: {
					totalBookings: existing.totalBookings,
					totalGuests: existing.totalGuests,
					grossRevenueCents: existing.grossRevenueCents.toString(),
					periodDate: existing.periodDate,
					periodType: existing.periodType,
				},
				newValues: {
					totalBookings: args.totalBookings,
					totalGuests: args.totalGuests,
					grossRevenueCents: args.grossRevenueCents.toString(),
				},
			});
			return existing._id;
		}
		const id = await ctx.db.insert("tourAnalytics", patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourAnalytics.created",
			resourceType: "tourAnalytics",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				periodDate: args.periodDate,
				periodType: args.periodType,
			},
		});
		return id;
	},
});

export const remove = mutation({
	args: { analyticsId: v.id("tourAnalytics") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, analyticsId: args.analyticsId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		analyticsId: v.id("tourAnalytics"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.analyticsId);
		if (!existing) throw new ConvexError("Analytics not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.analyticsId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourAnalytics.deleted",
			resourceType: "tourAnalytics",
			resourceId: args.analyticsId,
			oldValues: {
				tourId: existing.tourId,
				periodDate: existing.periodDate,
				periodType: existing.periodType,
			},
			newValues: {},
		});
		return args.analyticsId;
	},
});
/**
 * Recompute daily cache rows for one org + calendar day from bookings.
 * Skips tours with no bookings that day (avoids empty-row bloat).
 */
export const computeForOrgDay = internalMutation({
	args: {
		organizationId: v.string(),
		periodDate: v.string(),
	},
	handler: async (ctx, args) => {
		const tours = await ctx.db
			.query("tours")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.take(MAX_TOURS);
		const bookings = await ctx.db
			.query("bookings")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("date", args.periodDate),
			)
			.take(MAX_BOOKINGS);

		const byTour = new Map<string, typeof bookings>();
		for (const b of bookings) {
			const key = String(b.tourId);
			const list = byTour.get(key) ?? [];
			list.push(b);
			byTour.set(key, list);
		}

		let upserted = 0;
		for (const tour of tours) {
			if (tour.deletedAt !== undefined) continue;
			const dayBookings = byTour.get(String(tour._id));
			if (!dayBookings || dayBookings.length === 0) continue;

			const active = dayBookings.filter((b) => b.status !== "cancelled");
			const cancellations = dayBookings.length - active.length;
			const totalBookings = active.length;
			const totalGuests = active.reduce((s, b) => s + b.guests, 0);
			const grossRevenueCents = BigInt(
				active.reduce((s, b) => s + Number(b.totalAmountCents), 0),
			);
			const netRevenueCents = BigInt(
				active.reduce((s, b) => s + Number(b.netRevenueCents), 0),
			);
			const avgGroupSize =
				totalBookings > 0
					? Math.round((totalGuests / totalBookings) * 10) / 10
					: 0;
			const totalCapacity = tour.capacity;
			const utilizationRate =
				totalCapacity > 0
					? Math.min(
							1,
							Math.round((totalGuests / totalCapacity) * 1000) / 1000,
						)
					: 0;

			await ctx.runMutation(internal.tourAnalytics.internalUpsert, {
				organizationId: args.organizationId,
				userId: "system:cron",
				tourId: tour._id,
				periodDate: args.periodDate,
				periodType: "daily",
				totalBookings,
				totalGuests,
				grossRevenueCents,
				netRevenueCents,
				cancellations,
				noShows: 0,
				avgGroupSize,
				utilizationRate,
				totalCapacity,
			});
			upserted += 1;
		}
		return { upserted };
	},
});

/** Nightly: schedule yesterday's daily refresh for each org with tours. */
export const runDaily = internalMutation({
	args: {},
	handler: async (ctx) => {
		const yesterday = addDaysYmd(utcYmd(), -1);
		const tours = await ctx.db.query("tours").take(MAX_TOURS_SCAN);
		const orgIds = [
			...new Set(
				tours
					.filter((t) => t.deletedAt === undefined)
					.map((t) => t.organizationId),
			),
		].slice(0, MAX_ORGS);

		await Promise.all(
			orgIds.map((organizationId) =>
				ctx.scheduler.runAfter(0, internal.tourAnalytics.computeForOrgDay, {
					organizationId,
					periodDate: yesterday,
				}),
			),
		);
		return { orgs: orgIds.length, periodDate: yesterday };
	},
});
