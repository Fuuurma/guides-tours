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
import { requireMembership } from "./lib/authz";
import {
	buildBookingSources,
	buildChannelRevenue,
	buildConversions,
	buildDailyStats,
	buildFinancialHealth,
	buildForTour,
	buildGuideStats,
	buildOverview,
	buildRevenueSummary,
	buildTopTours,
	buildTourStats,
	buildWeeklyPulse,
} from "./lib/analyticsBuilders";

// ---- helpers ----



// ---- shared builders (no auth, no ctx-bound) ----
//
// Each builder takes the raw data it needs and returns the response.
// The public query and its internal mirror both call the same builder
// so the logic stays in one place.












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
