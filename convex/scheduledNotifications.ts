// Scheduled notifications: queue reminders + post-tour reviews.
// The cron in convex/notifications.ts picks rows where sent=false
// and scheduledFor <= now, dispatches via notification_dispatch.ts.
//
// Source: backend/notifications/service.py::schedule_booking_reminders
// (the source defines it but doesn't wire it into booking creation —
// we DO wire it in convex/bookings.ts::internalCreate).

import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { parseBookingTime } from "./lib/time";

// Hours-before-tour that each reminder fires at.
const REMINDER_OFFSETS = {
	reminder_24h: 24,
	reminder_2h: 2,
} as const;

/**
 * Schedule reminders (24h + 2h) and the post-tour review for a booking.
 * Skips past reminders silently (matches source).
 *
 * @returns IDs of the ScheduledNotification rows created (empty if all in past)
 */
export const scheduleForBooking = internalMutation({
	args: {
		organizationId: v.string(),
		bookingId: v.id("bookings"),
		date: v.string(),
		startTime: v.string(),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// Combine booking date + startTime into a UTC timestamp.
		const tourTs = parseBookingTime(args.date, args.startTime);
		if (!tourTs) {
			throw new ConvexError(
				`Cannot schedule: invalid date/time "${args.date} ${args.startTime}"`,
			);
		}

		const created: Id<"scheduledNotifications">[] = [];

		for (const [templateType, offsetHours] of Object.entries(
			REMINDER_OFFSETS,
		) as Array<[keyof typeof REMINDER_OFFSETS, number]>) {
			const template = await findTemplate(
				ctx,
				args.organizationId,
				templateType,
			);
			if (!template) continue; // source: skip if template missing
			const sendAt = tourTs - offsetHours * 3_600_000;
			if (sendAt <= now) continue; // source: skip if in past
			const maxRetries = await getTemplateMaxRetries(ctx, template);
			const id = await ctx.db.insert("scheduledNotifications", {
				organizationId: args.organizationId,
				bookingId: args.bookingId,
				templateId: template,
				scheduledFor: sendAt,
				sent: false,
				retryCount: 0,
				maxRetries,
				createdAt: now,
			});
			created.push(id);
		}

		return created;
	},
});

async function findTemplate(
	ctx: MutationCtx,
	organizationId: string,
	templateType: string,
): Promise<Id<"notificationTemplates"> | null> {
	const row = await ctx.db
		.query("notificationTemplates")
		.withIndex("by_org_type", (q) =>
			q.eq("organizationId", organizationId).eq("templateType", templateType),
		)
		.filter((q) => q.eq(q.field("isActive"), true))
		.first();
	return row?._id ?? null;
}

async function getTemplateMaxRetries(
	ctx: MutationCtx,
	id: Id<"notificationTemplates">,
): Promise<number> {
	const t = await ctx.db.get(id);
	return t?.retryCount ?? 3;
}

// parseBookingTime moved to convex/lib/time.ts (shared with
// public_booking.ts so date validation uses the same parser).
