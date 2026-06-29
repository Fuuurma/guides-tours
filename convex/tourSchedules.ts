// Tour schedules: per-tour, per-date instance with capacity tracking.
//
// Source: backend/tours/models.py::TourSchedule
//         backend/tours/services/schedule_service.py (if present)
//
// A schedule is a concrete tour instance (date + startTime) that
// customers can book against. Recurrence/seasonal schedules generate
// these automatically — the simple CRUD lives here.

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
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
		status: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		let all;
		if (args.tourId) {
			// SECURITY: scope to org even when filtering by tourId.
			all = await ctx.db
				.query("tourSchedules")
				.withIndex("by_tour_date", (q) =>
					q.eq("tourId", args.tourId!),
				)
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.collect();
		} else if (args.status) {
			all = await ctx.db
				.query("tourSchedules")
				.withIndex("by_org_status_date", (q) =>
					q
						.eq("organizationId", orgId)
						.eq("status", args.status as "available" | "full" | "cancelled"),
				)
				.collect();
		} else {
			// Apply optional date range at the index level so we don't
			// fetch every org schedule.
			all = await ctx.db
				.query("tourSchedules")
				.withIndex("by_org_date", (q) => {
					const eq = q.eq("organizationId", orgId);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.collect();
		}
		return all
			.filter((s) => {
				if (args.dateFrom && s.date < args.dateFrom) return false;
				if (args.dateTo && s.date > args.dateTo) return false;
				if (args.status && s.status !== args.status) return false;
				return true;
			})
			.sort((a, b) => a.date.localeCompare(b.date));
	},
});

export const get = query({
	args: { scheduleId: v.id("tourSchedules") },
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
		date: v.string(),
		startTime: v.string(),
		endTime: v.string(),
		capacityTotal: v.number(),
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
		startTime: v.string(),
		endTime: v.string(),
		capacityTotal: v.number(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.capacityTotal <= 0) {
			throw new ConvexError("Capacity must be positive");
		}
		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}
		const now = Date.now();
		const id = await ctx.db.insert("tourSchedules", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			date: args.date,
			startTime: args.startTime,
			endTime: args.endTime,
			capacityTotal: args.capacityTotal,
			capacityBooked: 0,
			status: "available",
			notes: args.notes ?? "",
			createdAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_schedule.created",
			resourceType: "tourSchedule",
			resourceId: id,
			oldValues: {},
			newValues: {
				tourId: args.tourId,
				date: args.date,
				startTime: args.startTime,
			},
		});
		return id;
	},
});

export const update = mutation({
	args: {
		scheduleId: v.id("tourSchedules"),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityTotal: v.optional(v.number()),
		status: v.optional(v.string()),
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
		scheduleId: v.id("tourSchedules"),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
		endTime: v.optional(v.string()),
		capacityTotal: v.optional(v.number()),
		status: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (
			args.capacityTotal !== undefined &&
			args.capacityTotal < existing.capacityBooked
		) {
			throw new ConvexError(
				`Capacity ${args.capacityTotal} is below current bookings (${existing.capacityBooked})`,
			);
		}
		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		for (const field of [
			"date",
			"startTime",
			"endTime",
			"capacityTotal",
			"status",
			"notes",
		]) {
			const value = (args as Record<string, unknown>)[field];
			if (value !== undefined) patch[field] = value;
		}
		// Auto-flip to "full" if capacityTotal reached
		if (
			patch.capacityTotal !== undefined &&
			(patch.capacityTotal as number) <= existing.capacityBooked
		) {
			patch.status = "full";
		}
		await ctx.db.patch(args.scheduleId, patch);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_schedule.updated",
			resourceType: "tourSchedule",
			resourceId: args.scheduleId,
			oldValues: { date: existing.date, status: existing.status },
			newValues: patch,
		});
		return args.scheduleId;
	},
});

export const incrementBooked = internalMutation({
	args: {
		organizationId: v.string(),
		scheduleId: v.id("tourSchedules"),
		guests: v.number(),
	},
	handler: async (ctx, args) => {
		// Defense-in-depth: callers (bookings.create, public_booking)
		// already validate guests > 0, but if a future caller forgets,
		// we'd silently let capacityBooked go negative. Floor first to
		// reject non-integer guests before they reach the math.
		if (args.guests <= 0 || !Number.isInteger(args.guests)) {
			throw new ConvexError("guests must be a positive integer");
		}
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (existing.status === "cancelled") {
			throw new ConvexError("Cannot book cancelled schedule");
		}
		const newBooked = existing.capacityBooked + args.guests;
		if (newBooked > existing.capacityTotal) {
			throw new ConvexError("Schedule over capacity");
		}
		const newStatus =
			newBooked >= existing.capacityTotal ? "full" : existing.status;
		await ctx.db.patch(args.scheduleId, {
			capacityBooked: newBooked,
			status: newStatus,
			updatedAt: Date.now(),
		});
		return args.scheduleId;
	},
});

/**
 * Inverse of incrementBooked. Restores a schedule's capacityBooked
 * counter when a booking is cancelled or refunded.
 */
export const decrementBooked = internalMutation({
	args: {
		organizationId: v.string(),
		scheduleId: v.id("tourSchedules"),
		guests: v.number(),
	},
	handler: async (ctx, args) => {
		// Same defense-in-depth as incrementBooked. A non-positive or
		// non-integer guests arg would either underflow capacityBooked
		// (silently capped at 0) or partial-decrement — both mask bugs.
		if (args.guests <= 0 || !Number.isInteger(args.guests)) {
			throw new ConvexError("guests must be a positive integer");
		}
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// Defense-in-depth: refuse underflow rather than silently
		// clamping to 0. The "ghost" capacity would otherwise be
		// lost forever, making the schedule perpetually under-booked.
		if (args.guests > existing.capacityBooked) {
			throw new ConvexError(
				`Cannot decrement by ${args.guests}: only ${existing.capacityBooked} booked`,
			);
		}
		const newBooked = existing.capacityBooked - args.guests;
		// If the schedule was full, dropping below capacity flips it
		// back to available.
		const newStatus =
			existing.status === "full" && newBooked < existing.capacityTotal
				? "available"
				: existing.status;
		await ctx.db.patch(args.scheduleId, {
			capacityBooked: newBooked,
			status: newStatus,
			updatedAt: Date.now(),
		});
		return args.scheduleId;
	},
});

export const remove = mutation({
	args: { scheduleId: v.id("tourSchedules") },
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
		scheduleId: v.id("tourSchedules"),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.scheduleId);
		if (!existing) throw new ConvexError("Schedule not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (existing.capacityBooked > 0) {
			throw new ConvexError("Cannot delete schedule with existing bookings");
		}
		await ctx.db.delete(args.scheduleId);
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tour_schedule.deleted",
			resourceType: "tourSchedule",
			resourceId: args.scheduleId,
			oldValues: { date: existing.date },
			newValues: {},
		});
		return args.scheduleId;
	},
});
