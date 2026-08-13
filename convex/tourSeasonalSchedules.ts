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
import { internal } from "./_generated/api";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { assertFieldWithinLimit } from "./lib/validation";
type InternalMutationRef = FunctionReference<"mutation", "internal">;
const internalRefs = internal as unknown as Record<
	string,
	Record<string, InternalMutationRef>
>;


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
		// Bound the result so an org with thousands of seasonal
		// schedules doesn't OOM the response. Previously used
		// .collect() (unbounded).
		const MAX_SEASONAL = 500;
		const all = await q.take(MAX_SEASONAL);
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
			internalRefs.tourSeasonalSchedules.internalCreate,
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
		assertFieldWithinLimit("name", args.name, 100);
		if (args.startTime !== undefined) {
			assertFieldWithinLimit("startTime", args.startTime, 10);
		}
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, 1000);
		}
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
			internalRefs.tourSeasonalSchedules.internalUpdate,
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
		if (args.name !== undefined) {
			assertFieldWithinLimit("name", args.name, 100);
		}
		if (args.startTime !== undefined) {
			assertFieldWithinLimit("startTime", args.startTime, 10);
		}
		if (args.notes !== undefined) {
			assertFieldWithinLimit("notes", args.notes, 1000);
		}
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
		// capacityOverride must be positive (mirrors internalCreate).
		if (args.capacityOverride !== undefined && args.capacityOverride <= 0) {
			throw new ConvexError("capacityOverride must be positive");
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
		// Flatten changes into oldValues/newValues maps of field → value.
		const oldValues: Record<string, unknown> = {};
		const newValues: Record<string, unknown> = {};
		for (const [field, { old: oldVal, new: newVal }] of Object.entries(changes)) {
			oldValues[field] = oldVal;
			newValues[field] = newVal;
		}
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourSeasonalSchedule.updated",
			resourceType: "tourSeasonalSchedule",
			resourceId: args.scheduleId,
			oldValues,
			newValues,
		});
		return args.scheduleId;
	},
});

/**
 * Materialize concrete tourSchedules from seasonal rules + exceptions,
 * skipping blackout dates. Idempotent: skips tour+date+startTime that
 * already exist.
 */
export const generate = mutation({
	args: {
		tourId: v.id("tours"),
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRefs.tourSeasonalSchedules.internalGenerate,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const internalGenerate = internalMutation({
	args: {
		organizationId: v.string(),
		userId: v.string(),
		tourId: v.id("tours"),
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		if (args.dateTo < args.dateFrom) {
			throw new ConvexError("dateTo must be on or after dateFrom");
		}

		const tour = await ctx.db.get(args.tourId);
		if (!tour) throw new ConvexError("Tour not found");
		if (tour.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: tour belongs to a different organization");
		}

		const seasonals = await ctx.db
			.query("tourSeasonalSchedules")
			.withIndex("by_tour_active", (q) =>
				q.eq("tourId", args.tourId).eq("isActive", true),
			)
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(500);
		const activeSeasonals = seasonals.sort(
			(a, b) => (b.priority ?? 0) - (a.priority ?? 0),
		);

		const exceptions = await ctx.db
			.query("tourExceptionDates")
			.withIndex("by_tour_date", (q) => q.eq("tourId", args.tourId))
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(500);
		const exceptionByDate = new Map(exceptions.map((e) => [e.date, e]));

		// Load only schedules in the generate window (indexed range) so
		// idempotency isn't capped by a global take(2000) of all history.
		const existingInRange = await ctx.db
			.query("tourSchedules")
			.withIndex("by_tour_date", (q) =>
				q
					.eq("tourId", args.tourId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(5000);
		const existingKeys = new Set(
			existingInRange.map((s) => `${s.date}|${s.startTime}`),
		);

		// Load all blackouts for this tour once — avoids the per-day
		// take(100) truncation in isBlackoutHelper for long-lived tours.
		const blackouts = await ctx.db
			.query("tourBlackoutDates")
			.withIndex("by_tour_start", (q) => q.eq("tourId", args.tourId))
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(500);

		let created = 0;
		let skipped = 0;
		const MAX_DAYS = 366;
		let dayCount = 0;

		for (
			let cursor = args.dateFrom;
			cursor <= args.dateTo && dayCount < MAX_DAYS;
			dayCount++
		) {
			const date = cursor;
			cursor = nextIsoDate(cursor);

			const blackedOut = blackouts.some(
				(b) => b.startDate <= date && b.endDate >= date,
			);
			if (blackedOut) {
				skipped++;
				continue;
			}

			const ex = exceptionByDate.get(date);
			if (ex?.exceptionType === "removed") {
				skipped++;
				continue;
			}

			let startTime: string | undefined;
			let endTime: string | undefined;
			let capacity: number | undefined;

			if (ex?.exceptionType === "added" || ex?.exceptionType === "modified") {
				startTime = ex.startTime ?? pickSeasonalStart(activeSeasonals, date);
				endTime =
					ex.endTime ??
					(startTime
						? endTimeFromDuration(startTime, tour.durationHours)
						: undefined);
				capacity =
					ex.capacityOverride ??
					pickSeasonalCapacity(activeSeasonals, date) ??
					tour.capacity;
			} else {
				const rule = pickSeasonalRule(activeSeasonals, date);
				if (!rule) {
					skipped++;
					continue;
				}
				startTime = rule.startTime ?? "09:00";
				endTime = endTimeFromDuration(startTime, tour.durationHours);
				capacity = rule.capacityOverride ?? tour.capacity;
			}

			if (!startTime || !endTime || !capacity || capacity <= 0) {
				skipped++;
				continue;
			}

			const key = `${date}|${startTime}`;
			if (existingKeys.has(key)) {
				skipped++;
				continue;
			}

			// Note: no per-day unique() check here — the
			// existingInRange batch above covers all schedules in the
			// window, and Convex mutations are serialized so no race
			// can occur within this mutation. The previous per-day
			// unique() added 366 queries for a year-long window with
			// no additional safety.

			const now = Date.now();
			const id = await ctx.db.insert("tourSchedules", {
				organizationId: args.organizationId,
				tourId: args.tourId,
				date,
				startTime,
				endTime,
				capacityTotal: capacity,
				capacityBooked: 0,
				status: "available",
				notes: "Generated from seasonal rules",
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
					date,
					startTime,
					generated: true,
				},
			});
			existingKeys.add(key);
			created++;
		}

		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: args.userId,
			action: "tourSeasonalSchedule.generated",
			resourceType: "tour",
			resourceId: args.tourId,
			oldValues: {},
			newValues: {
				dateFrom: args.dateFrom,
				dateTo: args.dateTo,
				created,
				skipped,
			},
		});

		return { created, skipped };
	},
});

function endTimeFromDuration(startTime: string, durationHours: number): string {
	const parts = startTime.split(":");
	const h = Number.parseInt(parts[0] ?? "0", 10);
	const m = Number.parseInt(parts[1] ?? "0", 10);
	const total = h * 60 + m + Math.round(durationHours * 60);
	const wrapped = ((total % 1440) + 1440) % 1440;
	const nh = Math.floor(wrapped / 60);
	const nm = wrapped % 60;
	return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function nextIsoDate(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1));
	return dt.toISOString().slice(0, 10);
}

function dowUtc(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function pickSeasonalRule(
	rules: Array<{
		startDate: string;
		endDate: string;
		daysOfWeek: number[];
		startTime?: string;
		capacityOverride?: number;
		priority?: number;
	}>,
	date: string,
) {
	const dow = dowUtc(date);
	return (
		rules.find(
			(r) =>
				r.startDate <= date &&
				r.endDate >= date &&
				r.daysOfWeek.includes(dow),
		) ?? null
	);
}

function pickSeasonalStart(
	rules: Array<{
		startDate: string;
		endDate: string;
		daysOfWeek: number[];
		startTime?: string;
	}>,
	date: string,
): string | undefined {
	return pickSeasonalRule(rules, date)?.startTime ?? "09:00";
}

function pickSeasonalCapacity(
	rules: Array<{
		startDate: string;
		endDate: string;
		daysOfWeek: number[];
		capacityOverride?: number;
	}>,
	date: string,
): number | undefined {
	return pickSeasonalRule(rules, date)?.capacityOverride;
}

export const remove = mutation({
	args: { scheduleId: v.id("tourSeasonalSchedules") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.tourSeasonalSchedules.internalRemove,
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
