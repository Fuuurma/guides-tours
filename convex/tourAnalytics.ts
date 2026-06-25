// Tour analytics cache: pre-computed (period × tour) metrics stored
// for fast dashboard reads. Source's TourAnalyticsService computes on
// demand; we cache the result keyed by (periodType, periodDate, tour).
//
// See backend/tours/services/tour_analytics_service.py for the
// reference math. Cache refresh is the caller's responsibility
// (typically a nightly cron — wired in Phase 21+).

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";

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
		let q = ctx.db
			.query("tourAnalytics")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.tourId) {
			q = ctx.db
				.query("tourAnalytics")
				.withIndex("by_tour_period", (q) => q.eq("tourId", args.tourId!));
		}
		const all = await q.collect();
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
			{ organizationId: member.organizationId, ...args },
		);
	},
});

export const internalUpsert = internalMutation({
	args: {
		organizationId: v.string(),
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
			return existing._id;
		}
		return await ctx.db.insert("tourAnalytics", patch);
	},
});

export const remove = mutation({
	args: { analyticsId: v.id("tourAnalytics") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, analyticsId: args.analyticsId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		analyticsId: v.id("tourAnalytics"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.analyticsId);
		if (!existing) throw new ConvexError("Analytics not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.analyticsId);
		return args.analyticsId;
	},
});