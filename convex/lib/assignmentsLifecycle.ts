// Assignment lifecycle logic, extracted from convex/assignments.ts
// (god-module decomposition). Owns the internal mutation bodies —
// the perform* functions the thin internalMutation wrappers in
// assignments.ts delegate to. Auth lives at the handler layer;
// these assume the caller already checked it.
//
// Bodies are moved verbatim; see assignments.ts for handler docs.

import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { assertFieldWithinLimit } from "./validation";
import { logAudit } from "./audit";
import { parseBookingTime } from "./time";
import { resolveTourStaffing } from "./staffing";
import { calculateEndTime } from "./assignmentTime";
import { checkConflictsHelper } from "./assignmentsShared";

export async function performCreate(
	ctx: MutationCtx,
	args: {
		tourId: Id<"tours">;
		guideId: string;
		date: string;
		startTime: string;
		vehicleId?: Id<"vehicles">;
		driverId?: Id<"drivers">;
		scheduleId?: Id<"tourSchedules">;
		organizationId: string;
		userId: string;
	}
) {
assertFieldWithinLimit("guideId", args.guideId, 100);
let tourId = args.tourId;
let date = args.date;
let startTime = args.startTime;
let scheduleId = args.scheduleId;
let schedule: Doc<"tourSchedules"> | null = null;

if (scheduleId) {
	schedule = await ctx.db.get(scheduleId);
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
// Index-pushes userId + status (needs-work 2026-09-07 P3): the old
// by_org scan filtered userId in memory after take(500), so a guide
// past position 500 in the org's vacation rows was silently
// unchecked. Per-guide approved rows are naturally tiny.
// Org filter stays in-memory over the tiny per-guide set — the
// original by_org scan was org-scoped and that contract holds.
const vacations = (await ctx.db
	.query("vacationRequests")
	.withIndex("by_user_status", (q) =>
		q.eq("userId", args.guideId).eq("status", "approved"),
	)
	.collect()).filter((vr) => vr.organizationId === args.organizationId);
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

// When a schedule is linked, its endTime is the published departure
// end — use it instead of startTime + durationHours so the assignment
// row, conflict window, and guide notification all cover the real
// published window (F122).
const endTime =
	schedule?.endTime ?? calculateEndTime(startTime, tour.durationHours);

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
		// Reuse the `schedule` fetched at the top of internalCreate
		// (still in scope) instead of a redundant ctx.db.get.
		if (schedule && vehicle.capacity < schedule.capacityBooked) {
			throw new ConvexError(
				`Vehicle seats (${vehicle.capacity}) are below booked guests (${schedule.capacityBooked})`,
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
	// Driver vacation check (mirrors the guide check above) — the
	// system accepts vacation rows for drivers, so writes must
	// enforce them or the rows are dead data (F347).
	const driverVacations = (
		await ctx.db
			.query("vacationRequests")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", driver.userId).eq("status", "approved"),
			)
			.collect()
	).filter((vr) => vr.organizationId === args.organizationId);
	if (
		driverVacations.some(
			(vr) => vr.startDate <= date && vr.endDate >= date,
		)
	) {
		throw new ConvexError("Driver is on approved vacation on this date");
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
	internal.assignmentNotifications.notifyGuide,
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
		internal.assignmentNotifications.notifyDriver,
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
}

export async function performUpdate(
	ctx: MutationCtx,
	args: {
		assignmentId: Id<"assignments">;
		guideId?: string;
		vehicleId?: Id<"vehicles">;
		driverId?: Id<"drivers">;
		clearVehicle?: boolean;
		clearDriver?: boolean;
		date?: string;
		startTime?: string;
		organizationId: string;
		userId: string;
	}
) {
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
	// Fetch the linked schedule once — its endTime is the published
	// departure end and wins over duration-derived math (F122), and
	// the vehicle-capacity check below reuses the same row.
	const linkedSchedule = existing.scheduleId
		? await ctx.db.get(existing.scheduleId)
		: null;

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
	// The published schedule end wins while the assignment still tracks
	// the departure (same date+start) — duration math only applies when
	// the row is schedule-free or has been moved off it (F122).
	const endTime =
		linkedSchedule &&
		linkedSchedule.date === next.date &&
		linkedSchedule.startTime === next.startTime
			? linkedSchedule.endTime
			: calculateEndTime(next.startTime, tour.durationHours);

	// Same tour+date+startTime staffing cap as create.
	// Fetch same-day assignments once and reuse for both the guide
	// staffing cap check and the fleet (vehicle/driver) checks.
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

	if (
		next.date !== existing.date ||
		next.startTime !== existing.startTime ||
		next.guideId !== existing.guideId
	) {
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

	const slotHasVehicle = activeOnSlot.some((a) => a.vehicleId);
	const slotHasDriver = activeOnSlot.some((a) => a.driverId);

	// Guide vacation + availability checks (mirrors internalCreate).
	// Only needed when guideId or date changed — if both are unchanged,
	// the existing assignment already passed these checks at create time.
	if (next.guideId !== existing.guideId || next.date !== existing.date) {
		// Same index-push as internalCreate (needs-work 09-07 P3).
		const vacations = (await ctx.db
			.query("vacationRequests")
			.withIndex("by_user_status", (q) =>
				q.eq("userId", next.guideId).eq("status", "approved"),
			)
			.collect()).filter(
			(vr) => vr.organizationId === args.organizationId,
		);
		const onVacation = vacations.some(
			(vr) =>
				vr.status === "approved" &&
				vr.startDate <= next.date &&
				vr.endDate >= next.date,
		);
		if (onVacation) {
			throw new ConvexError("Guide is on approved vacation on this date");
		}

		const avail = await ctx.db
			.query("availabilities")
			.withIndex("by_org_user_date", (q) =>
				q
					.eq("organizationId", args.organizationId)
					.eq("userId", next.guideId)
					.eq("date", next.date),
			)
			.unique();
		if (avail && !avail.isAvailable) {
			throw new ConvexError("Guide is marked as unavailable on this date");
		}
	}

	if (next.vehicleId) {
		const vehicle = await ctx.db.get(next.vehicleId);
		if (!vehicle) throw new ConvexError("Vehicle not found");
		if (vehicle.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: vehicle belongs to a different organization",
			);
		}
		// Vehicle status check (mirrors internalCreate) — prevents
		// reassigning to a retired/in-maintenance vehicle.
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
		// Vehicle capacity vs schedule booked (mirrors internalCreate).
		if (linkedSchedule) {
			if (vehicle.capacity < linkedSchedule.capacityBooked) {
				throw new ConvexError(
					`Vehicle seats (${vehicle.capacity}) are below booked guests (${linkedSchedule.capacityBooked})`,
				);
			}
		}
		// "Other vehicle" on slot (mirrors internalCreate).
		const otherVehicle = activeOnSlot.find(
			(a) => a.vehicleId && a.vehicleId !== next.vehicleId,
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

	if (next.driverId) {
		const driver = await ctx.db.get(next.driverId);
		if (!driver) throw new ConvexError("Driver not found");
		if (driver.organizationId !== args.organizationId) {
			throw new ConvexError(
				"Forbidden: driver belongs to a different organization",
			);
		}
		// Driver active check (mirrors internalCreate) — prevents
		// reassigning to an inactive driver.
		if (!driver.isActive) {
			throw new ConvexError("Driver is not active");
		}
		if (driver.userId === next.guideId) {
			throw new ConvexError(
				"The same person cannot be both guide and driver on one assignment",
			);
		}
		// "Other driver" on slot (mirrors internalCreate).
		const otherDriver = activeOnSlot.find(
			(a) => a.driverId && a.driverId !== next.driverId,
		);
		if (otherDriver) {
			throw new ConvexError(
				"This departure already has a different driver assigned",
			);
		}
		// Driver vacation check (mirrors internalCreate). Only needed
		// when the driver or the date changed — an unchanged assignment
		// already passed this check at write time (F347).
		if (next.driverId !== existing.driverId || next.date !== existing.date) {
			const driverVacations = (
				await ctx.db
					.query("vacationRequests")
					.withIndex("by_user_status", (q) =>
						q.eq("userId", driver.userId).eq("status", "approved"),
					)
					.collect()
			).filter((vr) => vr.organizationId === args.organizationId);
			if (
				driverVacations.some(
					(vr) => vr.startDate <= next.date && vr.endDate >= next.date,
				)
			) {
				throw new ConvexError(
					"Driver is on approved vacation on this date",
				);
			}
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

	// Dual-role: driver must not already be guiding an overlapping slot
	// (mirrors internalCreate). Runs on every update with a driver —
	// a date/startTime move with an unchanged driver can still collide
	// with the driver's guide duties in the new window (F63).
	if (next.driverId) {
		const driverRow = await ctx.db.get(next.driverId);
		if (driverRow) {
			const dual = await checkConflictsHelper(ctx, {
				organizationId: args.organizationId,
				date: next.date,
				startTime: next.startTime,
				endTime,
				guideId: driverRow.userId,
				excludeAssignmentId: args.assignmentId,
			});
			if (dual.length > 0) {
				throw new ConvexError(
					"This driver is already assigned as a guide during this time",
			);
		}
	}
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
			vehicleId: existing.vehicleId,
			driverId: existing.driverId,
			date: existing.date,
			startTime: existing.startTime,
			endTime: existing.endTime,
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
			internal.assignmentNotifications.notifyGuide,
			{
				...notifyArgs,
				guideId: next.guideId,
				event: "created" as const,
			},
		);
		await ctx.scheduler.runAfter(
			0,
			internal.assignmentNotifications.notifyGuide,
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
				internal.assignmentNotifications.notifyDriver,
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
				internal.assignmentNotifications.notifyDriver,
				{
					...notifyArgs,
					driverId: existing.driverId,
					event: "reassigned_away" as const,
				},
			);
		}
	}

	return args.assignmentId;
}

export async function performCancel(
	ctx: MutationCtx,
	args: {
		assignmentId: Id<"assignments">;
		reason?: string;
		organizationId: string;
		userId: string;
	}
) {
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
		internal.assignmentNotifications.notifyGuide,
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
			internal.assignmentNotifications.notifyDriver,
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
}

export async function performComplete(
	ctx: MutationCtx,
	args: {
		assignmentId: Id<"assignments">;
		organizationId: string;
		userId: string;
	}
) {
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
}

export async function performRemove(
	ctx: MutationCtx,
	args: {
		assignmentId: Id<"assignments">;
		organizationId: string;
		userId: string;
	}
) {
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
		oldValues: {
			status: a.status,
			guideId: a.guideId,
			date: a.date,
			startTime: a.startTime,
		},
		newValues: { deletedAt: now },
	});
	return args.assignmentId;
}

