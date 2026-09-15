// Shared assignment helpers, extracted from convex/assignments.ts
// (god-module decomposition). Conflict-row scanning used by the
// public checkConflicts query and the lifecycle mutations in
// lib/assignmentsLifecycle.ts. Time math lives in lib/assignmentTime.ts.

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { rangesOverlap } from "./assignmentTime";

/** Bound the conflict scans in checkConflicts + checkConflictsHelper. */
const MAX_CONFLICTS = 100;

export type ConflictIndexName =
| "by_org_guide_date"
| "by_org_vehicle_date"
| "by_org_driver_date";

/**
 * Shared conflict-scan core: rows of `assignments` overlapping
 * [startTime, endTime] on `date` for one resource index, minus
 * deleted/non-scheduled/excluded rows. `checkConflicts` (public query)
 * and `checkConflictsHelper` (mutation-side) used to each carry a
 * verbatim copy of this (fleet finding 2026-08-31 P2).
 */
export async function collectConflictRows(
ctx: QueryCtx | MutationCtx,
opts: {
	orgId: string;
	date: string;
	startTime: string;
	endTime: string;
	indexName: ConflictIndexName;
	indexField: string;
	value: string;
	excludeAssignmentId?: Id<"assignments"> | string;
},
): Promise<Doc<"assignments">[]> {
const rows = await ctx.db
	.query("assignments")
	.withIndex(opts.indexName, (q: any) =>
		q
			.eq("organizationId", opts.orgId)
			.eq(opts.indexField, opts.value)
			.eq("date", opts.date),
	)
	.take(MAX_CONFLICTS);
return rows.filter(
	(a) =>
		!a.deletedAt &&
		a.status === "scheduled" &&
		!(opts.excludeAssignmentId && a._id === opts.excludeAssignmentId) &&
		rangesOverlap(
			opts.startTime,
			opts.endTime,
			a.startTime,
			a.endTime ?? a.startTime,
		),
);
}

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
	// Collect overlapping assignments per conflict type. Run the
	// three index scans in parallel (they're independent) — the
	// public checkConflicts query already does this, but the helper
	// was sequential. Also batch tour name lookups instead of using
	// hardcoded "(guide conflict)" placeholders.
	const collected: Array<{
		conflictType: "guide" | "vehicle" | "driver";
		row: Doc<"assignments">;
	}> = [];

	async function collect(
		indexName: ConflictIndexName,
		indexField: string,
		value: string,
		conflictType: "guide" | "vehicle" | "driver",
	): Promise<void> {
		const rows = await collectConflictRows(ctx, {
			orgId: args.organizationId,
			date: args.date,
			startTime: args.startTime,
			endTime: args.endTime,
			indexName,
			indexField,
			value,
			excludeAssignmentId: args.excludeAssignmentId,
		});
		for (const r of rows) collected.push({ conflictType, row: r });
	}

	await Promise.all([
		args.guideId
			? collect("by_org_guide_date", "guideId", args.guideId, "guide")
			: Promise.resolve(),
		args.vehicleId
			? collect("by_org_vehicle_date", "vehicleId", args.vehicleId, "vehicle")
			: Promise.resolve(),
		args.driverId
			? collect("by_org_driver_date", "driverId", args.driverId, "driver")
			: Promise.resolve(),
	]);

	// Batched tour lookup: dedupe + fetch once + Map.
	const uniqueTourIds = [...new Set(collected.map((c) => c.row.tourId))];
	const tourDocs = await Promise.all(
		uniqueTourIds.map((id) => ctx.db.get(id)),
	);
	const tourNameById = new Map<string, string>();
	for (let i = 0; i < uniqueTourIds.length; i++) {
		const t = tourDocs[i];
		if (t) tourNameById.set(String(uniqueTourIds[i]), t.name);
	}

	return collected.map(({ conflictType, row: r }) => {
		const tourName = tourNameById.get(String(r.tourId)) ?? "(deleted tour)";
		return {
			conflictType,
			message: `${(conflictType[0] ?? "").toUpperCase()}${conflictType.slice(1)} already assigned to '${tourName}' from ${r.startTime} to ${r.endTime ?? r.startTime}`,
		};
	});
}
