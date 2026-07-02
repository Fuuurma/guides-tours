// Tour blackout dates: block bookings for specific date ranges per tour.
//
// Source: backend/tours/models.py::TourBlackoutDate

import { v, ConvexError } from "convex/values";
import {
	query,
	mutation,
	internalMutation,
} from "./_generated/server";
import type { FunctionReference } from "convex/server";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";

// ---- queries ----

export const list = query({
	args: {
		tourId: v.optional(v.id("tours")),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		// Bound the result so an org with hundreds of blackout
		// windows doesn't OOM the response. The FE page renders at
		// most a few dozen per tour.
		const MAX_BLACKOUTS = 500;
		let q = ctx.db
			.query("tourBlackoutDates")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			q = ctx.db
				.query("tourBlackoutDates")
				.withIndex("by_tour_start", (q) =>
					q.eq("tourId", args.tourId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		}
		const all = await q.take(MAX_BLACKOUTS);
		return all.sort((a, b) => a.startDate.localeCompare(b.startDate));
	},
});

// Returns true if any blackout covers the given (tourId, date).
/**
 * @internal
 * No FE caller as of 2026-06-29. The public booking flow calls
 * `isBlackoutHelper` server-side via `public_booking.internalCreate`
 * to reject blacked-out dates. The public query is useful for
 * FE pre-flight validation (grey out blackout dates in the date
 * picker) but no UI consumes it yet.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const isBlackout = query({
	args: {
		tourId: v.id("tours"),
		date: v.string(),
	},
	handler: async (ctx, args) => {
		await requireMembership(ctx);
		return await isBlackoutHelper(ctx, args.tourId, args.date);
	},
});

/**
 * Public version of isBlackout — no auth required. Used by the
 * unauthenticated public booking page to grey out blacked-out dates
 * in the date picker. The backend `public_booking.internalCreate`
 * still server-side validates with isBlackoutHelper as a guard.
 */
export const publicIsBlackout = query({
	args: {
		tourId: v.id("tours"),
		date: v.string(),
	},
	handler: async (ctx, args) => {
		return await isBlackoutHelper(ctx, args.tourId, args.date);
	},
});

export async function isBlackoutHelper(
	ctx: { db: { query: Function } },
	tourId: string,
	date: string,
): Promise<boolean> {
	// Use by_tour_start index with lte(date) to only fetch blackouts
	// that start before the target date — any blackout starting after
	// `date` can't cover it. The remaining range check (endDate >= date)
	// is done in JS since there's no endDate-leading index.
	// Bound the scan: a tour with >100 blackouts is extremely unusual.
	const MAX_CANDIDATES = 100;
	const candidates = await ctx.db
		.query("tourBlackoutDates")
		.withIndex("by_tour_start", (q: any) =>
			q.eq("tourId", tourId).lte("startDate", date),
		)
		.take(MAX_CANDIDATES);
	return candidates.some(
		(b: { startDate: string; endDate: string }) => b.endDate >= date,
	);
}

type Function = (...args: any[]) => any;

// ---- mutations ----

export const create = mutation({
	args: {
		tourId: v.id("tours"),
		startDate: v.string(),
		endDate: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, ...args },
		);
	},
});

export const internalCreate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
		startDate: v.string(),
		endDate: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.endDate < args.startDate) {
			throw new ConvexError("endDate must be on or after startDate");
		}
		const now = Date.now();
		const id = await ctx.db.insert("tourBlackoutDates", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			startDate: args.startDate,
			endDate: args.endDate,
			reason: args.reason ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_blackout.created",
			resourceType: "tourBlackout",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				startDate: args.startDate,
				endDate: args.endDate,
			},
		});
		return id;
	},
});

export const update = mutation({
	args: {
		blackoutId: v.id("tourBlackoutDates"),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { blackoutId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, blackoutId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		blackoutId: v.id("tourBlackoutDates"),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.blackoutId);
		if (!existing) throw new ConvexError("Blackout not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const nextStart = args.startDate ?? existing.startDate;
		const nextEnd = args.endDate ?? existing.endDate;
		if (nextEnd < nextStart) {
			throw new ConvexError("endDate must be on or after startDate");
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		const changes: Record<string, { old: unknown; new: unknown }> = {};
		if (args.startDate !== undefined && args.startDate !== existing.startDate) {
			patch.startDate = args.startDate;
			changes.startDate = { old: existing.startDate, new: args.startDate };
		}
		if (args.endDate !== undefined && args.endDate !== existing.endDate) {
			patch.endDate = args.endDate;
			changes.endDate = { old: existing.endDate, new: args.endDate };
		}
		if (args.reason !== undefined && args.reason !== existing.reason) {
			patch.reason = args.reason;
			changes.reason = { old: existing.reason, new: args.reason };
		}
		if (Object.keys(changes).length === 0) {
			return args.blackoutId;
		}
		await ctx.db.patch(args.blackoutId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourBlackout.updated",
			resourceType: "tourBlackout",
			resourceId: args.blackoutId,
			oldValues: {},
			newValues: { changes },
		});
		return args.blackoutId;
	},
});

export const remove = mutation({
	args: { blackoutId: v.id("tourBlackoutDates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, blackoutId: args.blackoutId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		blackoutId: v.id("tourBlackoutDates"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.blackoutId);
		if (!existing) throw new ConvexError("Blackout not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.blackoutId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourBlackout.deleted",
			resourceType: "tourBlackout",
			resourceId: args.blackoutId,
			oldValues: {
				startDate: existing.startDate,
				endDate: existing.endDate,
			},
			newValues: {},
		});
		return args.blackoutId;
	},
});
