// One-shot data repairs, each idempotent and resumable.
//
// A backfill here is never a scheduler and never runs automatically: an
// operator invokes it once (or resumes it) and reads the count back. That
// keeps a data decision an explicit act rather than something that fires
// on a cron and quietly rewrites rows.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * F-new-unlinked-booking-capacity-release follow-up (2026-10-04):
 * stamp the capacity claim on legacy bookings.
 *
 * `capacityClaimedScheduleId` is written by every increment path from the
 * day it shipped, so new rows are correct by construction. Rows created
 * before it carry no claim, and releaseBookingCapacity cannot tell those
 * apart from a booking that legitimately holds no seats — so until this
 * runs they keep the pre-existing scheduleId/date-fallback release
 * behavior. That is the compatible default, not the bug: a legacy row's
 * real claim is unknowable after the fact, and `scheduleId` is the best
 * available evidence.
 *
 * Known limitation, stated rather than hidden: a legacy row whose
 * scheduleId was patched retroactively WITHOUT a paired increment gets
 * stamped with a claim it never held, and keeps draining that schedule.
 * Correcting those needs per-row knowledge this backfill does not have;
 * they stay `fix-ready` in the hub LEDGER rather than being papered over.
 *
 * Idempotent: only rows with a scheduleId and no claim are touched, so a
 * re-run stamps nothing. Resumable: pass the returned `continueCursor`
 * back in to walk the next page. One page per call, so a single
 * invocation can never exceed a transaction's document-write limit.
 */
export const claimLinkedBookings = internalMutation({
	args: {
		// Pass the cursor from a previous run to resume. Omit to start.
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query("bookings")
			// Convex types the cursor as `string | null` while the arg is
			// `string | undefined` (exactOptionalPropertyTypes is on), so
			// normalize rather than widen the schema.
			.paginate({ numItems: 64, cursor: args.cursor ?? null });

		let stamped = 0;
		for (const booking of page.page) {
			if (booking.scheduleId === undefined) continue;
			if (booking.capacityClaimedScheduleId !== undefined) continue;
			await ctx.db.patch(booking._id, {
				capacityClaimedScheduleId: booking.scheduleId,
			});
			stamped++;
		}

		return {
			stamped,
			// The caller decides how many pages to run; keep going until
			// `isDone` reports the table is exhausted.
			isDone: page.isDone,
			continueCursor: page.continueCursor,
		};
	},
});
