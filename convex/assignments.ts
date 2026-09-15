// Assignments: schedule a guide + vehicle + driver for a tour at a
// specific date+time. Detect conflicts per resource.
//
// Source: backend/tours/services/assignment_service.py (837 lines)
//         backend/tours/models.py::Assignment
//         backend/tours/utils.py::parse_time + calculate_end_time
//
// Core CRUD + conflict detection. Guide + driver assignment emails/SMS
// are scheduled via assignmentNotifications (create / cancel / reassign).
// Honors notificationSettings.assignmentNotifyEnabled (default on).
//
// Time handling: we store HH:MM as strings (matching schema).
// Conflict math converts to integer minutes and compares with
// half-open intervals [start, end). Two ranges overlap iff
//   startA < endB && endA > startB.
//
// Authoritative reference for the overlap math:
//   backend/tours/services/assignment_service.py:81-83, 132-134, 195-197
//
// Tour duration lookup: tour.durationHours (number).

import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

import type { Id, Doc } from "./_generated/dataModel";
import { internalRefs } from "./lib/internalRefs";
import { requireMembership, requireRole } from "./lib/authz";

import { authComponent, createAuth } from "./auth";
import { resolveTourStaffing, evaluateSlotStaffing } from "./lib/staffing";
import { computeStaffingGaps } from "./lib/staffingGaps";

import { timeToMinutes } from "./lib/assignmentTime";
import {
	collectConflictRows,
	type ConflictIndexName,
} from "./lib/assignmentsShared";
import {
	performCancel,
	performComplete,
	performCreate,
	performRemove,
	performUpdate,
} from "./lib/assignmentsLifecycle";

// Re-exported so tests and sibling modules keep importing from this module.
export { checkConflictsHelper } from "./lib/assignmentsShared";

// ----- Queries -----

export const list = query({
	args: {
		dateFrom: v.optional(v.string()),
		dateTo: v.optional(v.string()),
		tourId: v.optional(v.id("tours")),
		guideId: v.optional(v.string()),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		status: v.optional(
			v.union(
				v.literal("scheduled"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);

		// Bound the result so an org with thousands of assignments
		// doesn't OOM the response. 500 covers ~6 months of daily
		// assignments per guide; callers can filter by date/status to
		// narrow further.
		const MAX_ASSIGNMENTS = 500;

		// Pick the most selective index. If a non-status, non-date
		// filter is set, use the leading-by-that-field index. Otherwise
		// use by_org_date with optional range scan + .order("asc") to
		// skip the date portion of the JS sort.
		let all;
		if (args.tourId) {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_tour_date", (q) => {
					const eq = q.eq("tourId", args.tourId!);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.take(MAX_ASSIGNMENTS);
			all = all.filter((a) => a.organizationId === member.organizationId);
		} else if (args.guideId) {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_guide_date", (q) => {
					const eq = q.eq("guideId", args.guideId!);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.take(MAX_ASSIGNMENTS);
			all = all.filter((a) => a.organizationId === member.organizationId);
		} else if (args.vehicleId) {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_vehicle_date", (q) => {
					const eq = q.eq("vehicleId", args.vehicleId!);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.take(MAX_ASSIGNMENTS);
			all = all.filter((a) => a.organizationId === member.organizationId);
		} else if (args.driverId) {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_driver_date", (q) => {
					const eq = q.eq("driverId", args.driverId!);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.take(MAX_ASSIGNMENTS);
			all = all.filter((a) => a.organizationId === member.organizationId);
		} else if (args.status) {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_org_status_date", (q) => {
					const eq = q
						.eq("organizationId", member.organizationId)
						.eq("status", args.status!);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.take(MAX_ASSIGNMENTS);
		} else {
			all = await ctx.db
				.query("assignments")
				.withIndex("by_org_date", (q) => {
					const eq = q.eq("organizationId", member.organizationId);
					if (args.dateFrom && args.dateTo) {
						return eq.gte("date", args.dateFrom).lte("date", args.dateTo);
					}
					if (args.dateFrom) return eq.gte("date", args.dateFrom);
					if (args.dateTo) return eq.lte("date", args.dateTo);
					return eq;
				})
				.order("asc")
				.take(MAX_ASSIGNMENTS);
		}
		let filtered = all.filter((a) => !a.deletedAt);
		if (args.dateFrom && (args.tourId || args.guideId || args.vehicleId || args.driverId || args.status)) {
			filtered = filtered.filter((a) => a.date >= args.dateFrom!);
		}
		if (args.dateTo && (args.tourId || args.guideId || args.vehicleId || args.driverId || args.status)) {
			filtered = filtered.filter((a) => a.date <= args.dateTo!);
		}
		if (args.status && (args.tourId || args.guideId || args.vehicleId || args.driverId)) {
			filtered = filtered.filter((a) => a.status === args.status);
		}
		if (args.tourId) filtered = filtered.filter((a) => a.tourId === args.tourId);
		if (args.guideId) filtered = filtered.filter((a) => a.guideId === args.guideId);
		if (args.vehicleId)
			filtered = filtered.filter((a) => a.vehicleId === args.vehicleId);
		if (args.driverId) filtered = filtered.filter((a) => a.driverId === args.driverId);
		filtered.sort((a, b) => {
			if (a.date !== b.date) return a.date < b.date ? -1 : 1;
			return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
		});
		return filtered;
	},
});

export const get = query({
	args: { assignmentId: v.id("assignments") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const a = await ctx.db.get(args.assignmentId);
		if (!a || a.deletedAt) return null;
		if (a.organizationId !== member.organizationId) return null;
		const tour = await ctx.db.get(a.tourId);
		return { ...a, tour: tour ? { _id: tour._id, name: tour.name } : null };
	},
});

/**
 * Sibling assignments on the same tour+date+startTime slot, plus
 * remaining staffing gaps. Powers assignment-detail co-guide UI.
 */
export const slotCompanions = query({
	args: { assignmentId: v.id("assignments") },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const a = await ctx.db.get(args.assignmentId);
		if (!a || a.deletedAt) return null;
		if (a.organizationId !== member.organizationId) return null;

		const tour = await ctx.db.get(a.tourId);
		if (!tour) return null;
		const rules = resolveTourStaffing(tour);

		const sameDay = await ctx.db
			.query("assignments")
			.withIndex("by_tour_date", (q) =>
				q.eq("tourId", a.tourId).eq("date", a.date),
			)
			.take(100);
		const siblings = sameDay.filter(
			(x) =>
				x.organizationId === member.organizationId &&
				x.deletedAt === undefined &&
				x.status !== "cancelled" &&
				x.startTime === a.startTime,
		);

		const guideCount = siblings.length;
		const hasVehicle = siblings.some((s) => s.vehicleId !== undefined);
		const hasDriver = siblings.some((s) => s.driverId !== undefined);
		const evaled = evaluateSlotStaffing({
			requiredGuides: rules.requiredGuides,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			guideCount,
			hasVehicle,
			hasDriver,
		});

		return {
			tourId: a.tourId,
			tourName: tour.name,
			date: a.date,
			startTime: a.startTime,
			endTime: a.endTime,
			scheduleId: a.scheduleId,
			requiredGuides: rules.requiredGuides,
			requiresVehicle: rules.requiresVehicle,
			requiresDriver: rules.requiresDriver,
			requiredVehicleType: rules.requiredVehicleType,
			guideCount,
			guidesNeeded: evaled.guidesNeeded,
			hasVehicle,
			hasDriver,
			gaps: evaled.gaps,
			ready: evaled.ready,
			siblings: siblings.map((s) => ({
				_id: s._id,
				guideId: s.guideId,
				vehicleId: s.vehicleId,
				driverId: s.driverId,
				status: s.status,
				isCurrent: s._id === args.assignmentId,
			})),
		};
	},
});

/**
 * Departures in a date range that still need guides and/or fleet.
 * Used by the Staffing readiness page and calendar gap cues.
 */
export const staffingGaps = query({
	args: {
		dateFrom: v.string(),
		dateTo: v.string(),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		const MAX = 500;

		const schedules = await ctx.db
			.query("tourSchedules")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.take(MAX);

		const assignments = await ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q
					.eq("organizationId", orgId)
					.gte("date", args.dateFrom)
					.lte("date", args.dateTo),
			)
			.take(MAX);

		const tourIds = new Set<string>();
		for (const s of schedules) tourIds.add(String(s.tourId));
		for (const a of assignments) {
			if (!a.deletedAt && a.status !== "cancelled") {
				tourIds.add(String(a.tourId));
			}
		}
		const toursById = new Map<
			string,
			{
				_id: Id<"tours">;
				name: string;
				tourType: string;
				requiredGuides: number;
				requiresVehicle?: boolean;
				requiresDriver?: boolean;
				requiredVehicleType?: string;
			}
		>();
		for (const id of tourIds) {
			const t = await ctx.db.get(id as Id<"tours">);
			if (t) {
				toursById.set(String(t._id), {
					_id: t._id,
					name: t.name,
					tourType: t.tourType,
					requiredGuides: t.requiredGuides,
					requiresVehicle: t.requiresVehicle,
					requiresDriver: t.requiresDriver,
					requiredVehicleType: t.requiredVehicleType,
				});
			}
		}

		return computeStaffingGaps({
			schedules,
			assignments,
			toursById,
		});
	},
});

/**
 * Conflict check for a proposed assignment slot.
 * Returns a list of conflicts (empty = safe to assign).
 *
 * Tour names are looked up in a single batched pass: we collect
 * every overlapping assignment first, dedupe their tourIds, fetch
 * each unique tour once, then map back. For N conflicts this is
 * O(unique tours) lookups instead of O(N).
 *
 * @internal
 * No FE caller as of 2026-06-29. The `assignments.create` mutation
 * runs the same `checkConflictsHelper` server-side as a guard, so the
 * public query is currently used only for ad-hoc debugging. Wired up
 * to the new-assignment form when live pre-flight validation is added.
 * See docs/DATA_LAYER_STATUS.md.
 */
export const checkConflicts = query({
	args: {
		date: v.string(),
		startTime: v.string(),
		endTime: v.string(),
		guideId: v.optional(v.string()),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		excludeAssignmentId: v.optional(v.id("assignments")),
	},
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const orgId = member.organizationId;
		type Conflict = {
			conflictType: "guide" | "vehicle" | "driver";
			assignment: typeof assignmentsList[number];
		};
		const candidateStart = args.startTime;
		const candidateEnd = args.endTime;

		// Collect every overlapping assignment per conflict type.
		// We keep the assignment + its conflict type so we can build
		// the final conflict array after the tour lookup pass.
		const assignmentsList: Doc<"assignments">[] = [];
		const overlapping: Conflict[] = [];

		async function collect(
			indexName: ConflictIndexName,
			indexField: string,
			value: string,
			conflictType: Conflict["conflictType"],
		): Promise<void> {
			const rows = await collectConflictRows(ctx, {
				orgId,
				date: args.date,
				startTime: candidateStart,
				endTime: candidateEnd,
				indexName,
				indexField,
				value,
				excludeAssignmentId: args.excludeAssignmentId,
			});
			for (const a of rows) {
				assignmentsList.push(a);
				overlapping.push({ conflictType, assignment: a });
			}
		}

		// Guide, vehicle, and driver conflict lookups are independent
		// index scans — run them in parallel when all three are provided.
		await Promise.all([
			args.guideId
				? collect("by_org_guide_date", "guideId", args.guideId, "guide")
				: Promise.resolve(),
			args.vehicleId
				? collect(
						"by_org_vehicle_date",
						"vehicleId",
						args.vehicleId,
						"vehicle",
					)
				: Promise.resolve(),
			args.driverId
				? collect(
						"by_org_driver_date",
						"driverId",
						args.driverId,
						"driver",
					)
				: Promise.resolve(),
		]);

		// Batched tour lookup: dedupe + fetch once + Map.
		const uniqueTourIds = [...new Set(assignmentsList.map((a) => a.tourId))];
		const tourDocs = await Promise.all(
			uniqueTourIds.map((id) => ctx.db.get(id)),
		);
		const tourNameById = new Map<string, string>();
		for (let i = 0; i < uniqueTourIds.length; i++) {
			const t = tourDocs[i];
			if (t) tourNameById.set(String(uniqueTourIds[i]), t.name);
		}

		const conflicts = overlapping.map(({ conflictType, assignment: a }) => {
			const tourName = tourNameById.get(String(a.tourId)) ?? "(deleted tour)";
			const endTime = a.endTime ?? a.startTime;
			return {
				conflictType,
				assignmentId: a._id,
				tourName,
				date: a.date,
				startTime: a.startTime,
				endTime,
				message: `${
					conflictType.charAt(0).toUpperCase() + conflictType.slice(1)
				} already assigned to '${tourName}' from ${a.startTime} to ${endTime}`,
			};
		});

		return conflicts;
	},
});

// ----- Mutations -----

// ----- Mutations -----
//
// Pattern: each public mutation does requireRole + delegates to an
// internal* mutation that takes (organizationId, userId) directly.
// Tests call internal* and skip the auth layer. Source doesn't have
// this split — it uses a Django `@require_staff` decorator on the
// view, which the test client can bypass by passing request.user.

const createArgs = {
	tourId: v.id("tours"),
	guideId: v.string(),
	date: v.string(),
	startTime: v.string(),
	vehicleId: v.optional(v.id("vehicles")),
	driverId: v.optional(v.id("drivers")),
	scheduleId: v.optional(v.id("tourSchedules")),
};

export const create = mutation({
	args: createArgs,
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);

		// Validate guide has the "guide" role in this organization
		// (source: assignment_service.py validates role__in=["guide","staff"]).
		const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
		const memberList = await auth.api.listMembers({
			headers,
			query: { organizationId: member.organizationId },
		});
		const guideMember = memberList.members.find(
			(m: { userId: string }) => m.userId === args.guideId,
		);
		if (!guideMember) {
			throw new ConvexError("Guide is not a member of this organization");
		}
		if (
			guideMember.role !== "guide" &&
			guideMember.role !== "owner" &&
			guideMember.role !== "admin"
		) {
			throw new ConvexError(
				`User with role "${guideMember.role}" cannot be assigned as guide`,
			);
		}

		return await ctx.runMutation(
			internalRefs.assignments.internalCreate,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				tourId: args.tourId,
				guideId: args.guideId,
				date: args.date,
				startTime: args.startTime,
				vehicleId: args.vehicleId,
				driverId: args.driverId,
				scheduleId: args.scheduleId,
			},
		);
	},
});

/**
 * Internal: create an assignment (no auth). Caller passes
 * organizationId + userId for the audit log. Source:
 * assignment_service.py::create_assignment:218-365.
 */
export const internalCreate = internalMutation({
	args: {
		tourId: v.id("tours"),
		guideId: v.string(),
		date: v.string(),
		startTime: v.string(),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		scheduleId: v.optional(v.id("tourSchedules")),
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => performCreate(ctx, args),
});

// ---- update ----

export const update = mutation({
	args: {
		assignmentId: v.id("assignments"),
		guideId: v.optional(v.string()),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		clearVehicle: v.optional(v.boolean()),
		clearDriver: v.optional(v.boolean()),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRefs.assignments.internalUpdate,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const internalUpdate = internalMutation({
	args: {
		assignmentId: v.id("assignments"),
		guideId: v.optional(v.string()),
		vehicleId: v.optional(v.id("vehicles")),
		driverId: v.optional(v.id("drivers")),
		clearVehicle: v.optional(v.boolean()),
		clearDriver: v.optional(v.boolean()),
		date: v.optional(v.string()),
		startTime: v.optional(v.string()),
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => performUpdate(ctx, args),
});


// ---- cancel ----

export const cancel = mutation({
	args: {
		assignmentId: v.id("assignments"),
		reason: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin", "member"]);
		return await ctx.runMutation(
			internalRefs.assignments.internalCancel,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				...args,
			},
		);
	},
});

export const internalCancel = internalMutation({
	args: {
		assignmentId: v.id("assignments"),
		reason: v.optional(v.string()),
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => performCancel(ctx, args),
});


// ---- complete ----

export const complete = mutation({
	args: { assignmentId: v.id("assignments") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, [
			"owner",
			"admin",
			"member",
			"guide",
		]);
		return await ctx.runMutation(
			internalRefs.assignments.internalComplete,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				assignmentId: args.assignmentId,
			},
		);
	},
});

export const internalComplete = internalMutation({
	args: {
		assignmentId: v.id("assignments"),
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => performComplete(ctx, args),
});


// ---- remove (soft delete) ----

export const remove = mutation({
	args: { assignmentId: v.id("assignments") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRefs.assignments.internalRemove,
			{
				organizationId: member.organizationId,
				userId: member.userId,
				assignmentId: args.assignmentId,
			},
		);
	},
});

export const internalRemove = internalMutation({
	args: {
		assignmentId: v.id("assignments"),
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => performRemove(ctx, args),
});
