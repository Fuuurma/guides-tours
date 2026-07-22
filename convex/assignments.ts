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
import type { MutationCtx } from "./_generated/server";
import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireMembership, requireRole } from "./lib/authz";
import { logAudit } from "./lib/audit";
import { authComponent, createAuth } from "./auth";
import { parseBookingTime } from "./lib/time";
import { resolveTourStaffing, evaluateSlotStaffing } from "./lib/staffing";
import { computeStaffingGaps } from "./lib/staffingGaps";

// ----- Time helpers (string "HH:MM" ↔ minutes-since-midnight) -----

/** Bound the conflict scans in checkConflicts + checkConflictsHelper. */
const MAX_CONFLICTS = 100;

export function timeToMinutes(t: string): number {
	const parts = t.split(":");
	const h = Number.parseInt(parts[0] ?? "0", 10);
	const m = Number.parseInt(parts[1] ?? "0", 10);
	return h * 60 + m;
}

export function minutesToTime(mins: number): string {
	const total = ((mins % 1440) + 1440) % 1440; // wrap past midnight
	const h = Math.floor(total / 60);
	const m = total % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * End time = start + durationHours. Wraps past midnight (matches
 * source's calculate_end_time which returns end_dt.time()).
 */
export function calculateEndTime(
	startTime: string,
	durationHours: number,
): string {
	return minutesToTime(timeToMinutes(startTime) + Math.round(durationHours * 60));
}

/**
 * Returns true iff [startA, endA) overlaps [startB, endB).
 * Both end points may be <= start (a zero-length or backward range
 * never overlaps).
 */
export function rangesOverlap(
	startA: string,
	endA: string,
	startB: string,
	endB: string,
): boolean {
	return (
		timeToMinutes(startA) < timeToMinutes(endB) &&
		timeToMinutes(endA) > timeToMinutes(startB)
	);
}

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
		const assignmentsList: Array<{
			_id: Id<"assignments">;
			organizationId: string;
			tourId: Id<"tours">;
			guideId: string;
			vehicleId?: Id<"vehicles">;
			driverId?: Id<"drivers">;
			date: string;
			startTime: string;
			endTime?: string;
			status: "scheduled" | "completed" | "cancelled";
			deletedAt?: number;
		}> = [];
		const overlapping: Conflict[] = [];

		async function collect(
			indexName:
				| "by_guide_date"
				| "by_vehicle_date"
				| "by_driver_date",
			indexField: string,
			value: string,
			conflictType: Conflict["conflictType"],
		): Promise<void> {
			const rows = await ctx.db
				.query("assignments")
				.withIndex(indexName, (q: any) =>
					q.eq(indexField, value).eq("date", args.date),
				)
				// SECURITY: scope by org. A guide belonging to multiple
				// orgs shouldn't surface other-org assignments as
				// conflicts in this org's conflict-check UI.
				// Bound the scan: a single date's worth of assignments
				// per resource is small in practice.
				.filter((q) => q.eq(q.field("organizationId"), orgId))
				.take(MAX_CONFLICTS);
			for (const a of rows) {
				if (a.deletedAt) continue;
				if (a.status !== "scheduled") continue;
				if (args.excludeAssignmentId && a._id === args.excludeAssignmentId)
					continue;
				if (
					!rangesOverlap(
						candidateStart,
						candidateEnd,
						a.startTime,
						a.endTime ?? a.startTime,
					)
				) {
					continue;
				}
				assignmentsList.push(a);
				overlapping.push({ conflictType, assignment: a });
			}
		}

		// Guide, vehicle, and driver conflict lookups are independent
		// index scans — run them in parallel when all three are provided.
		await Promise.all([
			args.guideId
				? collect("by_guide_date", "guideId", args.guideId, "guide")
				: Promise.resolve(),
			args.vehicleId
				? collect(
						"by_vehicle_date",
						"vehicleId",
						args.vehicleId,
						"vehicle",
					)
				: Promise.resolve(),
			args.driverId
				? collect(
						"by_driver_date",
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
			internalCreate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
	handler: async (ctx, args) => {
	let tourId = args.tourId;
	let date = args.date;
	let startTime = args.startTime;
	let scheduleId = args.scheduleId;

	if (scheduleId) {
		const schedule = await ctx.db.get(scheduleId);
		if (!schedule) throw new ConvexError("Schedule not found");
		if (schedule.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: schedule belongs to a different organization",
			);
		}
		if (schedule.status === "cancelled") {
			throw new ConvexError("Cannot assign a guide to a cancelled schedule");
		}
		// Multi-guide: count against tour.requiredGuides below.
		tourId = schedule.tourId;
		date = schedule.date;
		startTime = schedule.startTime;
	}

	if (parseBookingTime(date, startTime) === null) {
		throw new ConvexError(
			"Invalid date or start time (expected YYYY-MM-DD and HH:MM)",
		);
	}

	const tour = await ctx.db.get(tourId);
	if (!tour) throw new ConvexError("Tour not found");
	if (tour.organizationId !== args.organizationId) {
		throw new ConvexError("Forbidden: tour belongs to a different organization");
	}
	if (tour.deletedAt !== undefined) {
		throw new ConvexError("Tour is deleted");
	}
	if (!args.guideId.trim()) {
		throw new ConvexError("guideId is required");
	}

	const staffing = resolveTourStaffing(tour);

	// Check guide vacation overlap (source: 270-277).
	// Defense-in-depth: scope by orgId too. A guide belonging to
	// multiple orgs (Better Auth allows this) shouldn't have their
	// vacation in another org block an assignment in this org.
	// Bound the scan: a guide with >500 vacation requests is unusual.
	const MAX_VACATIONS = 500;
	const vacations = await ctx.db
		.query("vacationRequests")
		.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
		.filter((q) => q.eq(q.field("userId"), args.guideId))
		.take(MAX_VACATIONS);
	const onVacation = vacations.some(
		(vr) =>
			vr.status === "approved" &&
			vr.startDate <= date &&
			vr.endDate >= date,
	);
	if (onVacation) {
		throw new ConvexError("Guide is on approved vacation on this date");
	}

	// Check guide availability row. Same defense-in-depth: scope
	// by org so a guide's unavailability in another org doesn't
	// block an assignment here.
	const avail = await ctx.db
		.query("availabilities")
		.withIndex("by_org_user_date", (q) =>
			q
				.eq("organizationId", args.organizationId)
				.eq("userId", args.guideId)
				.eq("date", date),
		)
		.unique();
	if (avail && !avail.isAvailable) {
		throw new ConvexError("Guide is marked as unavailable on this date");
	}

	const endTime = calculateEndTime(startTime, tour.durationHours);

	// Slot staffing: up to requiredGuides active guides.
	const sameDay = await ctx.db
		.query("assignments")
		.withIndex("by_tour_date", (q) => q.eq("tourId", tourId).eq("date", date))
		.take(100);
	const activeOnSlot = sameDay.filter(
		(a) =>
			a.organizationId === args.organizationId &&
			a.status !== "cancelled" &&
			a.deletedAt === undefined &&
			a.startTime === startTime,
	);
	if (activeOnSlot.length >= staffing.requiredGuides) {
		throw new ConvexError(
			`This tour already has ${activeOnSlot.length} guide(s) on ${date} at ${startTime} (needs ${staffing.requiredGuides})`,
		);
	}
	if (activeOnSlot.some((a) => a.guideId === args.guideId)) {
		throw new ConvexError("This guide is already assigned to this departure");
	}

	const slotHasVehicle = activeOnSlot.some((a) => a.vehicleId);
	const slotHasDriver = activeOnSlot.some((a) => a.driverId);

	// Validate vehicle.
	if (args.vehicleId) {
		const vehicle = await ctx.db.get(args.vehicleId);
		if (!vehicle) throw new ConvexError("Vehicle not found");
		if (vehicle.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: vehicle belongs to a different organization",
			);
		}
		if (vehicle.status !== "available") {
			throw new ConvexError(
				`Vehicle is not available (status: ${vehicle.status})`,
			);
		}
		if (
			staffing.requiredVehicleType &&
			vehicle.vehicleType !== staffing.requiredVehicleType
		) {
			throw new ConvexError(
				`This tour requires a ${staffing.requiredVehicleType} (selected ${vehicle.vehicleType})`,
			);
		}
		if (scheduleId) {
			const scheduleRow = await ctx.db.get(scheduleId);
			if (scheduleRow && vehicle.capacity < scheduleRow.capacityBooked) {
				throw new ConvexError(
					`Vehicle seats (${vehicle.capacity}) are below booked guests (${scheduleRow.capacityBooked})`,
				);
			}
		}
		const otherVehicle = activeOnSlot.find(
			(a) => a.vehicleId && a.vehicleId !== args.vehicleId,
		);
		if (otherVehicle) {
			throw new ConvexError(
				"This departure already has a different vehicle assigned",
			);
		}
	} else if (staffing.requiresVehicle && !slotHasVehicle) {
		throw new ConvexError(
			"This tour requires a vehicle — select one before assigning",
		);
	}

	// Validate driver.
	if (args.driverId) {
		const driver = await ctx.db.get(args.driverId);
		if (!driver) throw new ConvexError("Driver not found");
		if (driver.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: driver belongs to a different organization",
			);
		}
		if (!driver.isActive) {
			throw new ConvexError("Driver is not active");
		}
		if (driver.userId === args.guideId) {
			throw new ConvexError(
				"The same person cannot be both guide and driver on one assignment",
			);
		}
		const otherDriver = activeOnSlot.find(
			(a) => a.driverId && a.driverId !== args.driverId,
		);
		if (otherDriver) {
			throw new ConvexError(
				"This departure already has a different driver assigned",
			);
		}
	} else if (staffing.requiresDriver && !slotHasDriver) {
		throw new ConvexError(
			"This tour requires a driver — select one before assigning",
		);
	}

	// Conflict detection.
	const conflicts = await checkConflictsHelper(ctx, {
		organizationId: args.organizationId,
		date,
		startTime,
		endTime,
		guideId: args.guideId,
		vehicleId: args.vehicleId,
		driverId: args.driverId,
	});
	if (conflicts.length > 0) {
		const first = conflicts[0];
		throw new ConvexError(first?.message ?? "Schedule conflict");
	}

	// Dual-role: driver must not already be guiding an overlapping slot.
	if (args.driverId) {
		const driverRow = await ctx.db.get(args.driverId);
		if (driverRow) {
			const dual = await checkConflictsHelper(ctx, {
				organizationId: args.organizationId,
				date,
				startTime,
				endTime,
				guideId: driverRow.userId,
			});
			if (dual.length > 0) {
				throw new ConvexError(
					"This driver is already assigned as a guide during this time",
				);
			}
		}
	}

	const now = Date.now();
	const assignmentId = await ctx.db.insert("assignments", {
		organizationId: args.organizationId,
		tourId,
		scheduleId,
		guideId: args.guideId,
		vehicleId: args.vehicleId,
		driverId: args.driverId,
		date,
		startTime,
		endTime,
		status: "scheduled",
		createdAt: now,
		updatedAt: now,
	});

	await logAudit(ctx, {
		organizationId: args.organizationId,
		userId: args.userId,
		action: "assignment.created",
		resourceType: "assignment",
		resourceId: assignmentId,
		oldValues: {},
		newValues: {
			tourId,
			guideId: args.guideId,
			scheduleId,
			date,
			startTime,
			endTime,
		},
	});

	await ctx.scheduler.runAfter(
		0,
		internal.assignmentNotifications.notifyGuide as unknown as Parameters<
			typeof ctx.scheduler.runAfter
		>[1],
		{
			organizationId: args.organizationId,
			assignmentId,
			guideId: args.guideId,
			event: "created" as const,
			tourName: tour.name,
			date,
			startTime,
			endTime,
		},
	);

	if (args.driverId) {
		await ctx.scheduler.runAfter(
			0,
			internal.assignmentNotifications.notifyDriver as unknown as Parameters<
				typeof ctx.scheduler.runAfter
			>[1],
			{
				organizationId: args.organizationId,
				assignmentId,
				driverId: args.driverId,
				event: "created" as const,
				tourName: tour.name,
				date,
				startTime,
				endTime,
			},
		);
	}

	return assignmentId;
	},
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
			internalUpdate as unknown as FunctionReference<"mutation", "public" | "internal">,
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
	handler: async (ctx, args) => {
		const existing = await ctx.db.get(args.assignmentId);
		if (!existing) throw new ConvexError("Assignment not found");
		if (existing.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (existing.deletedAt !== undefined) {
			throw new ConvexError("Assignment is deleted");
		}
		if (existing.status === "cancelled") {
			throw new ConvexError("Cannot modify a cancelled assignment");
		}
		if (existing.status === "completed") {
			throw new ConvexError("Cannot modify a completed assignment");
		}
		const tour = await ctx.db.get(existing.tourId);
		if (!tour) throw new ConvexError("Tour no longer exists");

		const nextVehicleId = args.clearVehicle
			? undefined
			: (args.vehicleId ?? existing.vehicleId);
		const nextDriverId = args.clearDriver
			? undefined
			: (args.driverId ?? existing.driverId);
		const next = {
			guideId: args.guideId ?? existing.guideId,
			vehicleId: nextVehicleId,
			driverId: nextDriverId,
			date: args.date ?? existing.date,
			startTime: args.startTime ?? existing.startTime,
		};
		if (parseBookingTime(next.date, next.startTime) === null) {
			throw new ConvexError(
				"Invalid date or start time (expected YYYY-MM-DD and HH:MM)",
			);
		}
		const staffing = resolveTourStaffing(tour);
		const endTime = calculateEndTime(next.startTime, tour.durationHours);

		// Same tour+date+startTime staffing cap as create.
		if (
			next.date !== existing.date ||
			next.startTime !== existing.startTime ||
			next.guideId !== existing.guideId
		) {
			const sameDay = await ctx.db
				.query("assignments")
				.withIndex("by_tour_date", (q) =>
					q.eq("tourId", existing.tourId).eq("date", next.date),
				)
				.take(100);
			const activeOnSlot = sameDay.filter(
				(a) =>
					a._id !== args.assignmentId &&
					a.organizationId === args.organizationId &&
					a.status !== "cancelled" &&
					a.deletedAt === undefined &&
					a.startTime === next.startTime,
			);
			if (activeOnSlot.length >= staffing.requiredGuides) {
				throw new ConvexError(
					`This tour already has ${activeOnSlot.length} guide(s) on ${next.date} at ${next.startTime} (needs ${staffing.requiredGuides})`,
				);
			}
			if (activeOnSlot.some((a) => a.guideId === next.guideId)) {
				throw new ConvexError(
					"This guide is already assigned to this departure",
				);
			}
		}

		const sameDayForFleet = await ctx.db
			.query("assignments")
			.withIndex("by_tour_date", (q) =>
				q.eq("tourId", existing.tourId).eq("date", next.date),
			)
			.take(100);
		const activeOnSlot = sameDayForFleet.filter(
			(a) =>
				a._id !== args.assignmentId &&
				a.organizationId === args.organizationId &&
				a.status !== "cancelled" &&
				a.deletedAt === undefined &&
				a.startTime === next.startTime,
		);
		const slotHasVehicle = activeOnSlot.some((a) => a.vehicleId);
		const slotHasDriver = activeOnSlot.some((a) => a.driverId);

		if (next.vehicleId) {
			const vehicle = await ctx.db.get(next.vehicleId);
			if (!vehicle) throw new ConvexError("Vehicle not found");
			if (vehicle.organizationId !== args.organizationId) {
				throw new ConvexError(
					"Forbidden: vehicle belongs to a different organization",
				);
			}
			if (
				staffing.requiredVehicleType &&
				vehicle.vehicleType !== staffing.requiredVehicleType
			) {
				throw new ConvexError(
					`This tour requires a ${staffing.requiredVehicleType} (selected ${vehicle.vehicleType})`,
				);
			}
		} else if (staffing.requiresVehicle && !slotHasVehicle) {
			throw new ConvexError(
				"This tour requires a vehicle — select one before assigning",
			);
		}

		if (next.driverId) {
			const driver = await ctx.db.get(next.driverId);
			if (!driver) throw new ConvexError("Driver not found");
			if (driver.organizationId !== args.organizationId) {
				throw new ConvexError(
					"Forbidden: driver belongs to a different organization",
				);
			}
			if (driver.userId === next.guideId) {
				throw new ConvexError(
					"The same person cannot be both guide and driver on one assignment",
				);
			}
		} else if (staffing.requiresDriver && !slotHasDriver) {
			throw new ConvexError(
				"This tour requires a driver — select one before assigning",
			);
		}

		const conflicts = await checkConflictsHelper(ctx, {
			organizationId: args.organizationId,
			date: next.date,
			startTime: next.startTime,
			endTime,
			guideId: next.guideId,
			vehicleId: next.vehicleId,
			driverId: next.driverId,
			excludeAssignmentId: args.assignmentId,
		});
		if (conflicts.length > 0) {
			const first = conflicts[0];
			throw new ConvexError(first?.message ?? "Schedule conflict");
		}

		const now = Date.now();
		await ctx.db.patch(args.assignmentId, {
			guideId: next.guideId,
			vehicleId: next.vehicleId,
			driverId: next.driverId,
			date: next.date,
			startTime: next.startTime,
			endTime,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: existing.organizationId,
			userId: args.userId,
			action: "assignment.updated",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: {
				guideId: existing.guideId,
				date: existing.date,
				startTime: existing.startTime,
			},
			newValues: next,
		});

		if (next.guideId !== existing.guideId) {
			const notifyArgs = {
				organizationId: args.organizationId,
				assignmentId: args.assignmentId,
				tourName: tour.name,
				date: next.date,
				startTime: next.startTime,
				endTime,
			};
			await ctx.scheduler.runAfter(
				0,
				internal.assignmentNotifications.notifyGuide as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[1],
				{
					...notifyArgs,
					guideId: next.guideId,
					event: "created" as const,
				},
			);
			await ctx.scheduler.runAfter(
				0,
				internal.assignmentNotifications.notifyGuide as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[1],
				{
					...notifyArgs,
					guideId: existing.guideId,
					event: "reassigned_away" as const,
				},
			);
		}

		if (next.driverId !== existing.driverId) {
			const notifyArgs = {
				organizationId: args.organizationId,
				assignmentId: args.assignmentId,
				tourName: tour.name,
				date: next.date,
				startTime: next.startTime,
				endTime,
			};
			if (next.driverId) {
				await ctx.scheduler.runAfter(
					0,
					internal.assignmentNotifications.notifyDriver as unknown as Parameters<
						typeof ctx.scheduler.runAfter
					>[1],
					{
						...notifyArgs,
						driverId: next.driverId,
						event: "created" as const,
					},
				);
			}
			if (existing.driverId) {
				await ctx.scheduler.runAfter(
					0,
					internal.assignmentNotifications.notifyDriver as unknown as Parameters<
						typeof ctx.scheduler.runAfter
					>[1],
					{
						...notifyArgs,
						driverId: existing.driverId,
						event: "reassigned_away" as const,
					},
				);
			}
		}

		return args.assignmentId;
	},
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
			internalCancel as unknown as FunctionReference<"mutation", "public" | "internal">,
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
	handler: async (ctx, args) => {
		const a = await ctx.db.get(args.assignmentId);
		if (!a) throw new ConvexError("Assignment not found");
		if (a.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		// Cap the cancel reason — it's stored in the audit log's
		// newValues, so an unbounded reason would bloat every row.
		const MAX_REASON_LEN = 500;
		if (args.reason !== undefined && args.reason.length > MAX_REASON_LEN) {
			throw new ConvexError(
				`Cancel reason is too long (max ${MAX_REASON_LEN} characters)`,
			);
		}
		if (a.status === "cancelled") {
			throw new ConvexError("Already cancelled");
		}
		if (a.status === "completed") {
			throw new ConvexError("Cannot cancel a completed assignment");
		}
		const now = Date.now();
		await ctx.db.patch(args.assignmentId, {
			status: "cancelled",
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.cancelled",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: { status: a.status },
			newValues: { status: "cancelled", reason: args.reason ?? "" },
		});

		const tour = await ctx.db.get(a.tourId);
		await ctx.scheduler.runAfter(
			0,
			internal.assignmentNotifications.notifyGuide as unknown as Parameters<
				typeof ctx.scheduler.runAfter
			>[1],
			{
				organizationId: a.organizationId,
				assignmentId: args.assignmentId,
				guideId: a.guideId,
				event: "cancelled" as const,
				tourName: tour?.name ?? "Tour",
				date: a.date,
				startTime: a.startTime,
				endTime: a.endTime,
			},
		);

		if (a.driverId) {
			await ctx.scheduler.runAfter(
				0,
				internal.assignmentNotifications.notifyDriver as unknown as Parameters<
					typeof ctx.scheduler.runAfter
				>[1],
				{
					organizationId: a.organizationId,
					assignmentId: args.assignmentId,
					driverId: a.driverId,
					event: "cancelled" as const,
					tourName: tour?.name ?? "Tour",
					date: a.date,
					startTime: a.startTime,
					endTime: a.endTime,
				},
			);
		}

		return args.assignmentId;
	},
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
			internalComplete as unknown as FunctionReference<"mutation", "public" | "internal">,
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
	handler: async (ctx, args) => {
		const a = await ctx.db.get(args.assignmentId);
		if (!a) throw new ConvexError("Assignment not found");
		if (a.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		if (a.status !== "scheduled") {
			throw new ConvexError(
				`Only scheduled assignments can be completed (was ${a.status})`,
			);
		}
		const now = Date.now();
		await ctx.db.patch(args.assignmentId, {
			status: "completed",
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.completed",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: { status: "scheduled" },
			newValues: { status: "completed" },
		});
		return args.assignmentId;
	},
});

// ---- remove (soft delete) ----

export const remove = mutation({
	args: { assignmentId: v.id("assignments") },
	handler: async (ctx, args) => {
		const member = await requireRole(ctx, ["owner", "admin"]);
		return await ctx.runMutation(
			internalRemove as unknown as FunctionReference<"mutation", "public" | "internal">,
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
	handler: async (ctx, args) => {
		const a = await ctx.db.get(args.assignmentId);
		if (!a) throw new ConvexError("Assignment not found");
		if (a.organizationId !== args.organizationId) {
			throw new ConvexError("Forbidden: wrong organization");
		}
		const now = Date.now();
		await ctx.db.patch(args.assignmentId, {
			deletedAt: now,
			updatedAt: now,
		});
		await logAudit(ctx, {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.soft_deleted",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: {},
			newValues: { deletedAt: now },
		});
		return args.assignmentId;
	},
});

// ----- Helpers -----

export async function checkConflictsHelper(
	ctx: MutationCtx,
	args: {
		organizationId: string;
		date: string;
		startTime: string;
		endTime: string;
		guideId: string;
		vehicleId?: Id<"vehicles">;
		driverId?: Id<"drivers">;
		excludeAssignmentId?: string;
	},
): Promise<Array<{ conflictType: "guide" | "vehicle" | "driver"; message: string }>> {
	const out: Array<{ conflictType: "guide" | "vehicle" | "driver"; message: string }> = [];
	const checkOne = async (
		conflictType: "guide" | "vehicle" | "driver",
		rows: Array<{
			_id: string;
			startTime: string;
			endTime?: string;
			deletedAt?: number;
			status: string;
		}>,
		tourName: string,
	) => {
		for (const r of rows) {
			if (r.deletedAt) continue;
			if (r.status !== "scheduled") continue;
			if (args.excludeAssignmentId && r._id === args.excludeAssignmentId) continue;
			if (
				rangesOverlap(
					args.startTime,
					args.endTime,
					r.startTime,
					r.endTime ?? r.startTime,
				)
			) {
				out.push({
					conflictType,
					message: `${(conflictType[0] ?? "").toUpperCase()}${conflictType.slice(1)} already assigned to '${tourName}' from ${r.startTime} to ${r.endTime ?? r.startTime}`,
				});
			}
		}
	};
	if (args.guideId) {
		const rows = await ctx.db
			.query("assignments")
			.withIndex("by_guide_date", (q) =>
				q.eq("guideId", args.guideId).eq("date", args.date),
			)
			// SECURITY: scope to org — a guideId from another org must
			// not surface as a "conflict" in this org's UI.
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(MAX_CONFLICTS);
		await checkOne("guide", rows, "(guide conflict)");
	}
	if (args.vehicleId) {
		const rows = await ctx.db
			.query("assignments")
			.withIndex("by_vehicle_date", (q) =>
				q.eq("vehicleId", args.vehicleId).eq("date", args.date),
			)
			// SECURITY: scope to org.
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(MAX_CONFLICTS);
		await checkOne("vehicle", rows, "(vehicle conflict)");
	}
	if (args.driverId) {
		const rows = await ctx.db
			.query("assignments")
			.withIndex("by_driver_date", (q) =>
				q.eq("driverId", args.driverId).eq("date", args.date),
			)
			// SECURITY: scope to org.
			.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
			.take(MAX_CONFLICTS);
		await checkOne("driver", rows, "(driver conflict)");
	}
	return out;
}
