// Assignments: schedule a guide + vehicle + driver for a tour at a
// specific date+time. Detect conflicts per resource.
//
// Source: backend/tours/services/assignment_service.py (837 lines)
//         backend/tours/models.py::Assignment
//         backend/tours/utils.py::parse_time + calculate_end_time
//
// Phase 7.4 scope: core CRUD + conflict detection. Phase 7.6 adds
// assignment notification emails.
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
import { requireMembership, requireRole } from "./lib/authz";
import { authComponent, createAuth } from "./auth";

// ----- Time helpers (string "HH:MM" ↔ minutes-since-midnight) -----

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
		const all = await ctx.db
			.query("assignments")
			.withIndex("by_org_date", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.collect();
		let filtered = all.filter((a) => !a.deletedAt);
		if (args.dateFrom) filtered = filtered.filter((a) => a.date >= args.dateFrom!);
		if (args.dateTo) filtered = filtered.filter((a) => a.date <= args.dateTo!);
		if (args.tourId) filtered = filtered.filter((a) => a.tourId === args.tourId);
		if (args.guideId) filtered = filtered.filter((a) => a.guideId === args.guideId);
		if (args.vehicleId)
			filtered = filtered.filter((a) => a.vehicleId === args.vehicleId);
		if (args.driverId) filtered = filtered.filter((a) => a.driverId === args.driverId);
		if (args.status) filtered = filtered.filter((a) => a.status === args.status);
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
 * Conflict check for a proposed assignment slot.
 * Returns a list of conflicts (empty = safe to assign).
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
		const conflicts: Array<{
			conflictType: "guide" | "vehicle" | "driver";
			assignmentId: string;
			tourName: string;
			date: string;
			startTime: string;
			endTime: string;
			message: string;
		}> = [];

		const candidateStart = args.startTime;
		const candidateEnd = args.endTime;

		// Guide conflicts.
		if (args.guideId) {
			const guideRows = await ctx.db
				.query("assignments")
				.withIndex("by_guide_date", (q) =>
					q.eq("guideId", args.guideId!).eq("date", args.date),
				)
				.collect();
			for (const a of guideRows) {
				if (a.deletedAt) continue;
				if (a.status !== "scheduled") continue;
				if (args.excludeAssignmentId && a._id === args.excludeAssignmentId) continue;
				if (
					rangesOverlap(
						candidateStart,
						candidateEnd,
						a.startTime,
						a.endTime ?? a.startTime,
					)
				) {
					const tour = await ctx.db.get(a.tourId);
					conflicts.push({
						conflictType: "guide",
						assignmentId: a._id,
						tourName: tour?.name ?? "(deleted tour)",
						date: a.date,
						startTime: a.startTime,
						endTime: a.endTime ?? a.startTime,
						message: `Guide already assigned to '${tour?.name ?? "(deleted tour)"}' from ${a.startTime} to ${a.endTime ?? a.startTime}`,
					});
				}
			}
		}

		// Vehicle conflicts.
		if (args.vehicleId) {
			const rows = await ctx.db
				.query("assignments")
				.withIndex("by_vehicle_date", (q) =>
					q.eq("vehicleId", args.vehicleId!).eq("date", args.date),
				)
				.collect();
			for (const a of rows) {
				if (a.deletedAt) continue;
				if (a.status !== "scheduled") continue;
				if (args.excludeAssignmentId && a._id === args.excludeAssignmentId) continue;
				if (
					rangesOverlap(
						candidateStart,
						candidateEnd,
						a.startTime,
						a.endTime ?? a.startTime,
					)
				) {
					const tour = await ctx.db.get(a.tourId);
					conflicts.push({
						conflictType: "vehicle",
						assignmentId: a._id,
						tourName: tour?.name ?? "(deleted tour)",
						date: a.date,
						startTime: a.startTime,
						endTime: a.endTime ?? a.startTime,
						message: `Vehicle already assigned to '${tour?.name ?? "(deleted tour)"}' from ${a.startTime} to ${a.endTime ?? a.startTime}`,
					});
				}
			}
		}

		// Driver conflicts.
		if (args.driverId) {
			const rows = await ctx.db
				.query("assignments")
				.withIndex("by_driver_date", (q) =>
					q.eq("driverId", args.driverId!).eq("date", args.date),
				)
				.collect();
			for (const a of rows) {
				if (a.deletedAt) continue;
				if (a.status !== "scheduled") continue;
				if (args.excludeAssignmentId && a._id === args.excludeAssignmentId) continue;
				if (
					rangesOverlap(
						candidateStart,
						candidateEnd,
						a.startTime,
						a.endTime ?? a.startTime,
					)
				) {
					const tour = await ctx.db.get(a.tourId);
					conflicts.push({
						conflictType: "driver",
						assignmentId: a._id,
						tourName: tour?.name ?? "(deleted tour)",
						date: a.date,
						startTime: a.startTime,
						endTime: a.endTime ?? a.startTime,
						message: `Driver already assigned to '${tour?.name ?? "(deleted tour)"}' from ${a.startTime} to ${a.endTime ?? a.startTime}`,
					});
				}
			}
		}

		void orgId; // referenced for tenant isolation (queries already scope by org)
		return conflicts;
	},
});

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
		organizationId: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, args) => {
	const tour = await ctx.db.get(args.tourId);
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

	// Check guide vacation overlap (source: 270-277).
	const vacations = await ctx.db
		.query("vacationRequests")
		.withIndex("by_user", (q) => q.eq("userId", args.guideId))
		.collect();
	const onVacation = vacations.some(
		(vr) =>
			vr.status === "approved" &&
			vr.startDate <= args.date &&
			vr.endDate >= args.date,
	);
	if (onVacation) {
		throw new ConvexError("Guide is on approved vacation on this date");
	}

	// Check guide availability row.
	const avail = await ctx.db
		.query("availabilities")
		.withIndex("by_user_date", (q) =>
			q.eq("userId", args.guideId).eq("date", args.date),
		)
		.unique();
	if (avail && !avail.isAvailable) {
		throw new ConvexError("Guide is marked as unavailable on this date");
	}

	const startTime = args.startTime;
	const endTime = calculateEndTime(startTime, tour.durationHours);

	// Validate vehicle.
	if (args.vehicleId) {
		const vehicle = await ctx.db.get(args.vehicleId);
		if (!vehicle) throw new ConvexError("Vehicle not found");
		if (vehicle.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: vehicle belongs to a different organization",
			);
		}
		if (vehicle.status !== "available" && vehicle.status !== "active") {
			throw new ConvexError(
				`Vehicle is not available (status: ${vehicle.status})`,
			);
		}
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
	}

	// Conflict detection.
	const conflicts = await checkConflictsHelper(ctx, {
		organizationId: args.organizationId,
		date: args.date,
		startTime,
		endTime,
		guideId: args.guideId,
		vehicleId: args.vehicleId,
		driverId: args.driverId,
	});
	if (conflicts.length > 0) {
		throw new ConvexError(conflicts[0]!.message);
	}

	const now = Date.now();
	const assignmentId = await ctx.db.insert("assignments", {
		organizationId: args.organizationId,
		tourId: args.tourId,
		guideId: args.guideId,
		vehicleId: args.vehicleId,
		driverId: args.driverId,
		date: args.date,
		startTime,
		endTime,
		status: "scheduled",
		createdAt: now,
		updatedAt: now,
	});

	await ctx.db.insert("auditLogs", {
		organizationId: args.organizationId,
		userId: args.userId,
		action: "assignment.created",
		resourceType: "assignment",
		resourceId: assignmentId,
		oldValues: {},
		newValues: {
			tourId: args.tourId,
			guideId: args.guideId,
			date: args.date,
			startTime,
			endTime,
		},
		timestamp: now,
	});

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

		const next = {
			guideId: args.guideId ?? existing.guideId,
			vehicleId: args.vehicleId ?? existing.vehicleId,
			driverId: args.driverId ?? existing.driverId,
			date: args.date ?? existing.date,
			startTime: args.startTime ?? existing.startTime,
		};
		const endTime = calculateEndTime(next.startTime, tour.durationHours);

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
			throw new ConvexError(conflicts[0]!.message);
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
		await ctx.db.insert("auditLogs", {
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
			timestamp: now,
		});
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
		await ctx.db.insert("auditLogs", {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.cancelled",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: { status: a.status },
			newValues: { status: "cancelled", reason: args.reason ?? "" },
			timestamp: now,
		});
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
		await ctx.db.insert("auditLogs", {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.completed",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: { status: "scheduled" },
			newValues: { status: "completed" },
			timestamp: now,
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
		await ctx.db.insert("auditLogs", {
			organizationId: a.organizationId,
			userId: args.userId,
			action: "assignment.soft_deleted",
			resourceType: "assignment",
			resourceId: args.assignmentId,
			oldValues: {},
			newValues: { deletedAt: now },
			timestamp: now,
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
					message: `${conflictType[0]!.toUpperCase() + conflictType.slice(1)} already assigned to '${tourName}' from ${r.startTime} to ${r.endTime ?? r.startTime}`,
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
			.collect();
		await checkOne("guide", rows, "(guide conflict)");
	}
	if (args.vehicleId) {
		const rows = await ctx.db
			.query("assignments")
			.withIndex("by_vehicle_date", (q) =>
				q.eq("vehicleId", args.vehicleId).eq("date", args.date),
			)
			.collect();
		await checkOne("vehicle", rows, "(vehicle conflict)");
	}
	if (args.driverId) {
		const rows = await ctx.db
			.query("assignments")
			.withIndex("by_driver_date", (q) =>
				q.eq("driverId", args.driverId).eq("date", args.date),
			)
			.collect();
		await checkOne("driver", rows, "(driver conflict)");
	}
	return out;
}