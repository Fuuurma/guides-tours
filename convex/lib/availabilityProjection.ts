// Denormalized availability projection (DST-guides-tours-03).
//
// One `tourAvailability` doc per (tourId, date) mirrors the day's
// tourSchedules slots so the public booking page reads a single doc
// instead of scanning the schedules table.
//
// The projection is rebuilt inside the SAME mutation as every
// tourSchedules write — internalCreate / internalUpdate /
// internalRemove / incrementBooked / decrementBooked / seasonal
// generate. Never a scheduler: if the projection could lag the
// schedule write, the public page would sell seats that no longer
// exist (or hide seats that do). Pattern: restaurant-calendar
// capacity — system-design-primer.

import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Rebuild the availability projection doc for one (tour, date).
 * Reads the day's tourSchedules rows and upserts the matching
 * tourAvailability doc; deletes the doc when no schedules remain.
 *
 * Callers MUST invoke this inside the same mutation that mutates
 * tourSchedules — Convex's transaction guarantees the projection
 * can never drift from the source rows.
 */
export async function syncTourAvailability(
	ctx: MutationCtx,
	args: {
		organizationId: string;
		tourId: Id<"tours">;
		date: string;
	},
): Promise<void> {
	// A tour only ever runs a handful of departures per day; 100 is
	// a generous bound (matches the take() bounds used elsewhere).
	const schedules = await ctx.db
		.query("tourSchedules")
		.withIndex("by_tour_date", (q) =>
			q.eq("tourId", args.tourId).eq("date", args.date),
		)
		.filter((q) => q.eq(q.field("organizationId"), args.organizationId))
		.take(100);

	const existing = await ctx.db
		.query("tourAvailability")
		.withIndex("by_tour_date", (q) =>
			q.eq("tourId", args.tourId).eq("date", args.date),
		)
		.unique();

	if (schedules.length === 0) {
		if (existing) await ctx.db.delete(existing._id);
		return;
	}

	const slots = schedules
		.map((s) => ({
			scheduleId: s._id,
			startTime: s.startTime,
			endTime: s.endTime,
			capacityTotal: s.capacityTotal,
			capacityBooked: s.capacityBooked,
			seatsLeft: s.capacityTotal - s.capacityBooked,
			status: s.status,
		}))
		.sort((a, b) => a.startTime.localeCompare(b.startTime));

	if (existing) {
		await ctx.db.patch(existing._id, { slots, updatedAt: Date.now() });
	} else {
		await ctx.db.insert("tourAvailability", {
			organizationId: args.organizationId,
			tourId: args.tourId,
			date: args.date,
			slots,
			updatedAt: Date.now(),
		});
	}
}
