// Tour seasonal schedules: define repeating schedules within a date
// range + days-of-week (e.g. "Daily 10:00 tour from June through
// August, Mon/Wed/Fri only, capacity 15").
//
// Source: backend/tours/models.py::TourSeasonalSchedule

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
		isActive: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let q = ctx.db
			.query("tourSeasonalSchedules")
			.withIndex("by_org", (q) => q.eq("organizationId", orgId));
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			q = ctx.db
				.query("tourSeasonalSchedules")
				.withIndex("by_tour_active", (q) =>
					q.eq("tourId", args.tourId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId));
		}
		const all = await q.collect();
		return all
			.filter((s) => args.isActive === undefined || s.isActive === args.isActive)
			.sort((a, b) => a.startDate.localeCompare(b.startDate));
	},
});

export const get = query({
	args: { scheduleId: v.id("tourSeasonalSchedules") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const s = await ctx.db.get(args.scheduleId);
		if (!s) throw new ConvexError("Schedule not found");
		if (s.organizationId !== member.organizationId) {
			throw new ConvexError("Forbidden: schedule belongs to a different organization");
		}
		return s;
	},
});

// ---- mutations ----

export const create = mutation({
	args: {
		tourId: v.id("tours"),
		name: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		daysOfWeek: v.array(v.number()),
		startTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		priority: v.optional(v.number()),
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
		name: v.string(),
		startDate: v.string(),
		endDate: v.string(),
		daysOfWeek: v.array(v.number()),
		startTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		priority: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.endDate < args.startDate) {
			throw new ConvexError("endDate must be on or after startDate");
		}
		for (const d of args.daysOfWeek) {
			if (d < 0 || d > 6) {
				throw new ConvexError(`daysOfWeek must be 0..6, got ${d}`);
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
		const id = await ctx.db.insert("tourSeasonalSchedules", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			name: args.name,
			startDate: args.startDate,
			endDate: args.endDate,
			daysOfWeek: args.daysOfWeek,
			startTime: args.startTime,
			capacityOverride: args.capacityOverride,
			isActive: args.isActive ?? true,
			priority: args.priority ?? 0,
			notes: args.notes ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourSeasonalSchedule.created",
			resourceType: "tourSeasonalSchedule",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				name: args.name,
				startDate: args.startDate,
				endDate: args.endDate,
			},
		});
		return id;
	},
});

export const update = mutation({
	args: {
		scheduleId: v.id("tourSeasonalSchedules"),
		name: v.optional(v.string()),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		daysOfWeek: v.optional(v.array(v.number())),
		startTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		priority: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		const { scheduleId, ...rest } = args;
		return await ctx.runMutation(
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, scheduleId, ...rest },
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		scheduleId: v.id("tourSeasonalSchedules"),
		name: v.optional(v.string()),
		startDate: v.optional(v.string()),
		endDate: v.optional(v.string()),
		daysOfWeek: v.optional(v.array(v.number())),
		startTime: v.optional(v.string()),
		capacityOverride: v.optional(v.number()),
		isActive: v.optional(v.boolean()),
		priority: v.optional(v.number()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const nextStart = args.startDate ?? existing.startDate;
		const nextEnd = args.endDate ?? existing.endDate;
		if (nextEnd < nextStart) {
			throw new ConvexError("endDate must be on or after startDate");
		}
		if (args.daysOfWeek) {
			for (const d of args.daysOfWeek) {
				if (d < 0 || d > 6) {
					throw new ConvexError(`daysOfWeek must be 0..6, got ${d}`);
				}
			}
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		const changes: Record<string, { old: unknown; new: unknown }> = {};
		for (const field of [
			"name",
			"startDate",
			"endDate",
			"daysOfWeek",
			"startTime",
			"capacityOverride",
			"isActive",
			"priority",
			"notes",
		] as const) {
			const value = args[field];
			if (value !== undefined && value !== existing[field]) {
				patch[field] = value;
				changes[field] = { old: existing[field], new: value };
			}
		}
		if (Object.keys(changes).length === 0) {
			return args.scheduleId;
		}
		await ctx.db.patch(args.scheduleId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourSeasonalSchedule.updated",
			resourceType: "tourSeasonalSchedule",
			resourceId: args.scheduleId,
			oldValues: {},
			newValues: { changes },
		});
		return args.scheduleId;
	},
});

export const remove = mutation({
	args: { scheduleId: v.id("tourSeasonalSchedules") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
			{ organizationId: member.organizationId, userId: member.userId, scheduleId: args.scheduleId },
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		scheduleId: v.id("tourSeasonalSchedules"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		await ctx.db.delete(args.scheduleId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourSeasonalSchedule.deleted",
			resourceType: "tourSeasonalSchedule",
			resourceId: args.scheduleId,
			oldValues: {
				tourId: existing.tourId,
				name: existing.name,
				startDate: existing.startDate,
				endDate: existing.endDate,
			},
			newValues: {},
		});
		return args.scheduleId;
	},
});