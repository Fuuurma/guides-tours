// Tour exception dates: per-date overrides to a tour's regular schedule.
// Three types:
//   - ADDED: run this tour on a date it normally wouldn't (e.g. holiday)
//   - REMOVED: skip a date that would normally be scheduled
//   - MODIFIED: change time/capacity for one occurrence
//
// Source: backend/tours/models.py::TourExceptionDate

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
		exceptionType: v.optional(v.string()),
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		// Bound the result so an org with thousands of exception
		// dates doesn't OOM the response.
		const MAX_EXCEPTIONS = 500;
		let q = ctx.db
			.query("tourExceptionDates")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			q = ctx.db
				.query("tourExceptionDates")
				.withIndex("by_tour_date", (q) => q.eq("tourId", args.tourId!))
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		}
		const all = await q.take(MAX_EXCEPTIONS);
		return all
			.filter((e) => {
				if (args.exceptionType && e.exceptionType !== args.exceptionType) return false;
				if (args.dateFrom && e.date < args.dateFrom) return false;
				if (args.dateTo && e.date > args.dateTo) return false;
				return true;
			})
			.sort((a, b) => a.date.localeCompare(b.date));
	},
});

export const get = query({
	args: { exceptionId: v.id("tourExceptionDates") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const e = await ctx.db.get(args.exceptionId);
		if (!e) throw new ConvexError("Exception not found");
		if (e.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: exception belongs to a different organization");
		}
		return e;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		tourId: v.id("tours"),
		date: v.string(),
		exceptionType: v.union(
			v.literal("added"),
			v.literal("removed"),
			v.literal("modified"),
		),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		reason: v.optional(v.string()),
		notes: v.optional(v.string()),
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
		date: v.string(),
		exceptionType: v.union(
			v.literal("added"),
			v.literal("removed"),
			v.literal("modified"),
		),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		reason: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.exceptionType === "modified") {
			if (!args.startTime || !args.endTime) {
				throw new ConvexError("modified exceptions require startTime and endTime");
			}
			if (args.endTime < args.startTime) {
				throw new ConvexError("endTime must be on or after startTime");
			}
		}
		if (args.capacityOverride !== undefined && args.capacityOverride <= 0) {
			throw new ConvexError("capacityOverride must be positive");
		}
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}
		const now = Date.now();
		const id = await ctx.db.insert("tourExceptionDates", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			date: args.date,
			exceptionType: args.exceptionType,
			startTime: args.startTime,
			endTime: args.endTime,
			capacityOverride: args.capacityOverride,
			reason: args.reason ?? "",
			notes: args.notes ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourException.created",
			resourceType: "tourException",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				date: args.date,
				exceptionType: args.exceptionType,
			},
		});
		return id;
	},
});

export const update = mutation({
	args: {
		exceptionId: v.id("tourExceptionDates"),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		reason: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { exceptionId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, exceptionId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		exceptionId: v.id("tourExceptionDates"),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		reason: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.exceptionId);
		if (!existing) throw new ConvexError("Exception not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const nextStart = args.startTime ?? existing.startTime;
		const nextEnd = args.endTime ?? existing.endTime;
		if (nextStart && nextEnd && nextEnd < nextStart) {
			throw new ConvexError("endTime must be on or after startTime");
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		const changes: Record<string, { old: unknown; new: unknown }> = {};
		for (const field of [
			"startTime",
			"endTime",
			"capacityOverride",
			"reason",
			"notes",
		] as const) {
			const incoming = args[field];
			if (incoming !== undefined && incoming !== existing[field]) {
				patch[field] = incoming;
				changes[field] = { old: existing[field], new: incoming };
			}
		}
		if (Object.keys(changes).length === 0) {
			return args.exceptionId;
		}
		await ctx.db.patch(args.exceptionId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourException.updated",
			resourceType: "tourException",
			resourceId: args.exceptionId,
			oldValues: {},
			newValues: { changes },
		});
		return args.exceptionId;
	},
});

export const remove = mutation({
	args: { exceptionId: v.id("tourExceptionDates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, exceptionId: args.exceptionId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		exceptionId: v.id("tourExceptionDates"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.exceptionId);
		if (!existing) throw new ConvexError("Exception not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.exceptionId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourException.deleted",
			resourceType: "tourException",
			resourceId: args.exceptionId,
			oldValues: {
				tourId: existing.tourId,
				date: existing.date,
				exceptionType: existing.exceptionType,
			},
			newValues: {},
		});
		return args.exceptionId;
	},
});