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
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import { internalRefs } from "./lib/internalRefs";
import {
	requireMembership,
	requirePermission,
	requireRole,
} from "./lib/authz";
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
		const { rows, truncated } = await _exceptionRowsForList(ctx, {
			organizationId: member.organizationId,
			tourId: args.tourId,
			exceptionType: args.exceptionType,
			dateFrom: args.dateFrom,
			dateTo: args.dateTo,
		});
		return { exceptions: rows, truncated };
	},
});

/**
 * Org-scoped exception-date scan shared by `list`. Probes one row
 * past the cap so `truncated` says "more rows exist" instead of
 * silently dropping them (F468). Exported for tests — the public
 * `list` adds auth on top of the same scan.
 */
export async function _exceptionRowsForList(
	ctx: QueryCtx,
	args: {
		organizationId: string;
		tourId?: Id<"tours">;
		exceptionType?: string;
		dateFrom?: string;
		dateTo?: string;
	},
): Promise<{ rows: Doc<"tourExceptionDates">[]; truncated: boolean }> {
	const MAX_EXCEPTIONS = 500;
	let q = ctx.db
		.query("tourExceptionDates")
		.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId));
	if (args.tourId) {
		q = ctx.db
			.query("tourExceptionDates")
			.withIndex("by_tour_date", (q) => q.eq("tourId", args.tourId!))
			.filter((q) =>
				q.eq(q.field("organizationId"), args.organizationId),
			);
	}
	const probe = await q.take(MAX_EXCEPTIONS + 1);
	const truncated = probe.length > MAX_EXCEPTIONS;
	return {
		rows: probe
			.slice(0, MAX_EXCEPTIONS)
			.filter((e) => {
				if (args.exceptionType && e.exceptionType !== args.exceptionType)
					return false;
				if (args.dateFrom && e.date < args.dateFrom) return false;
				if (args.dateTo && e.date > args.dateTo) return false;
				return true;
			})
			.sort((a, b) => a.date.localeCompare(b.date)),
		truncated,
	};
}

/**
 * F344: exceptions are authoritative like blackouts — the public booking
 * paths consult this helper so already-materialized schedules honor them
 * live (generate is additive-only and never retracts):
 *   - "removed" suppresses every schedule on that date;
 *   - "modified"/"added" with an explicit startTime makes ONLY that slot
 *     bookable (a re-generated exception row at another time splits
 *     capacity against the materialized original otherwise);
 *   - capacityOverride caps the effective capacity.
 * Loose ctx mirrors isBlackoutHelper in tourBlackoutDates.ts.
 */
export async function exceptionForDateHelper(
	ctx: { db: { query: Function } },
	tourId: string,
	organizationId: string,
	date: string,
): Promise<{
	exceptionType: string;
	startTime?: string;
	endTime?: string;
	capacityOverride?: number;
} | null> {
	// biome-ignore lint/suspicious/noExplicitAny: helper accepts loose ctx
	const ex = await ctx.db
		.query("tourExceptionDates")
		.withIndex("by_tour_date", (q: any) =>
			q.eq("tourId", tourId).eq("date", date),
		)
		// biome-ignore lint/suspicious/noExplicitAny: helper accepts loose ctx
		.filter((q: any) => q.eq(q.field("organizationId"), organizationId))
		.first();
	return ex ?? null;
}

type Function = (...args: any[]) => any;

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
		const member = await requirePermission(ctx, "tour", "create");
		return await ctx.runMutation(
			internalRefs.tourExceptionDates.internalCreate,
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
		// F345: strict endTime > startTime for every timed type — a
		// zero-duration exception materializes a schedule row that is
		// publicly bookable but can never be updated (internalUpdate
		// re-validates the merged times before the status guard) nor
		// removed once booked. The prior `<` check admitted exactly the
		// equality wedge; "added" validated nothing at all.
		if (args.exceptionType === "modified" || args.exceptionType === "added") {
			if (!args.startTime || !args.endTime) {
				throw new ConvexError(`${args.exceptionType} exceptions require startTime and endTime`);
			}
			if (args.endTime <= args.startTime) {
				throw new ConvexError("endTime must be after startTime");
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
		// Uniqueness: one exception per (tourId, date). Multiple
		// "modified" exceptions for the same date would conflict
		// during seasonal schedule generation. The by_tour_date index
		// leads with (tourId, date) so this is an indexed lookup.
		const existing = await ctx.db
			.query("tourExceptionDates")
			.withIndex("by_tour_date", (q) =>
				q.eq("tourId", args.tourId).eq("date", args.date),
			)
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.first();
		if (existing) {
			throw new ConvexError(
				"An exception already exists for this tour on this date",
			);
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
		const member = await requirePermission(ctx, "tour", "update");
		const { exceptionId, ...rest } = args;
		return await ctx.runMutation(
			internalRefs.tourExceptionDates.internalUpdate,
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
		// F345: `<=` — zero-duration rows are uncancellable wedges (same
		// invariant internalCreate enforces).
		if (nextStart && nextEnd && nextEnd <= nextStart) {
			throw new ConvexError("endTime must be after startTime");
		}
		// capacityOverride must be positive (mirrors internalCreate).
		if (args.capacityOverride !== undefined && args.capacityOverride <= 0) {
			throw new ConvexError("capacityOverride must be positive");
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
		const oldValues: Record<string, unknown> = {};
		const newValues: Record<string, unknown> = {};
		for (const [field, { old: oldVal, new: newVal }] of Object.entries(changes)) {
			oldValues[field] = oldVal;
			newValues[field] = newVal;
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourException.updated",
			resourceType: "tourException",
			resourceId: args.exceptionId,
			oldValues,
			newValues,
		});
		return args.exceptionId;
	},
});

export const remove = mutation({
	args: { exceptionId: v.id("tourExceptionDates") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.tourExceptionDates.internalRemove,
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