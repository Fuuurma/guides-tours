// Shared assignment helpers, extracted from convex/assignments.ts
// (god-module decomposition). Conflict-row scanning used by the
// public checkConflicts query and the lifecycle mutations in
// lib/assignmentsLifecycle.ts. Time math lives in lib/assignmentTime.ts.

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { findOrgMember } from "./authz";
import { shiftDate, windowsOverlapAbs } from "./assignmentTime";

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
// Scan the candidate date AND the previous day — a row that started
// yesterday and wrapped past midnight occupies this morning's minutes
// but lives under yesterday's date key (F62). Same-day rows are
// covered by the absolute-window comparison below.
const [rows, prevRows] = await Promise.all([
	ctx.db
		.query("assignments")
		.withIndex(opts.indexName, (q: any) =>
			q
				.eq("organizationId", opts.orgId)
				.eq(opts.indexField, opts.value)
				.eq("date", opts.date),
		)
		.take(MAX_CONFLICTS),
	ctx.db
		.query("assignments")
		.withIndex(opts.indexName, (q: any) =>
			q
				.eq("organizationId", opts.orgId)
				.eq(opts.indexField, opts.value)
				.eq("date", shiftDate(opts.date, -1)),
		)
		.take(MAX_CONFLICTS),
]);
return [...rows, ...prevRows].filter(
	(a) =>
		!a.deletedAt &&
		a.status === "scheduled" &&
		!(opts.excludeAssignmentId && a._id === opts.excludeAssignmentId) &&
		windowsOverlapAbs(
			opts.date,
			opts.startTime,
			opts.endTime,
			a.date,
			a.startTime,
			a.endTime,
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

/**
 * The "guide must belong to this org" invariant, in one place.
 *
 * This check had three homes and one hole (GT-AUDIT-02 / hub F594): it was
 * inlined in `assignments.create` and duplicated privately in `ops.ts`, while
 * `performUpdate` — which is what actually writes `guideId` — had no check at
 * all. A caller could therefore name any user id and have them assigned and
 * notified with the org's tour name, date and times, across tenant boundaries.
 *
 * Kept in this module because every writer of `guideId` (assignments.create,
 * lib/assignmentsLifecycle.performUpdate, ops.staffDeparture) already imports
 * from here, so the invariant now has exactly one definition to drift from.
 */
export type OrgMemberLookup = (
	ctx: MutationCtx,
	organizationId: string,
	userId: string,
) => Promise<{ userId: string; role?: string } | null>;

export async function assertGuideAssignable(
	ctx: MutationCtx,
	organizationId: string,
	guideId: string,
	// Injectable so the policy below is unit-testable. The default goes through
	// the Better Auth component, which needs a live session: under convex-test
	// there is none, so a test calling performUpdate directly gets Unauthorized
	// from the lookup rather than from this function. That is why the lookup is
	// a parameter and the role/rejection policy is tested with a stub instead of
	// the suite growing its first component-registration harness.
	lookup: OrgMemberLookup = findOrgMember,
): Promise<void> {
	const guideMember = await lookup(ctx, organizationId, guideId);
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
}
