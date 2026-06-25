// Scheduled notification runner + cleanup jobs.
//
// Source: backend/notifications/tasks.py + backend/tours/tasks_celery.py.
// Three Celery tasks, none of which had a beat schedule in source —
// the design notes said they'd be run manually. We wire them to
// Convex cron jobs in convex/crons.ts.
//
//   - process_pending_notifications: every 5 minutes
//       Find ScheduledNotification where sent=false AND
//       scheduled_for <= now. Dispatch via notification_dispatch.
//       On failure: bump retry_count and reschedule at 5min × (n+1).
//       On max retries: mark sent=true with a "failed" log entry.
//
//   - cleanup_old_assignments: daily @ 03:00 UTC
//       Find Assignment where status IN (completed, cancelled) AND
//       date < (today - 90 days). Source only counted; we actually
//       soft-delete (deletedAt = now) so audit/analytics queries can
//       still find them but the working set stays small.
//
//   - cleanup_old_notifications: daily @ 04:00 UTC
//       Hard-delete notificationLogs where created_at < (now - 30 days)
//       AND scheduledNotifications where sent=true AND scheduledFor <
//       (now - 30 days). Same as source — these are operational
//       artifacts, not user data.

import { ConvexError, v } from "convex/values";
import {
	internalQuery,
	internalMutation,
	type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

const BATCH_SIZE = 100;
const NOTIFICATION_CUTOFF_MINUTES = 10;
const RETRY_BACKOFF_BASE_MINUTES = 5;

const ARCHIVE_AFTER_DAYS = 90;
const NOTIFICATION_LOG_RETENTION_DAYS = 30;

/**
 * Used by the notification_dispatch action to load everything it
 * needs to render and send an email/SMS. Returns null if the row
 * was already deleted or marked sent in between.
 */
export const getScheduledForDispatch = internalQuery({
	args: { scheduledId: v.id("scheduledNotifications") },
	handler: async (ctx, args) => {
		const scheduled = await ctx.db.get(args.scheduledId);
		if (!scheduled || scheduled.sent) return null;

		const [template, booking] = await Promise.all([
			ctx.db.get(scheduled.templateId),
			ctx.db.get(scheduled.bookingId),
		]);
		if (!template || !booking) return null;

		const customer = await ctx.db.get(booking.customerId);
		if (!customer) return null;

		// Tour name is needed for the template body.
		const tour = await ctx.db.get(booking.tourId);
		const tourName = tour?.name ?? "your tour";

		return {
			scheduled: { _id: scheduled._id, organizationId: scheduled.organizationId },
			template: {
				templateType: template.templateType,
				channel: template.channel,
			},
			booking: {
				date: booking.date,
				startTime: booking.startTime,
				tourName,
			},
			customer: {
				name: customer.name,
				email: customer.email,
				phone: customer.phone,
			},
		};
	},
});

export const processPendingNotifications = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const cutoffHigh = now + NOTIFICATION_CUTOFF_MINUTES * 60_000;
		const cutoffLow = now - NOTIFICATION_CUTOFF_MINUTES * 60_000;

		// Index `by_sent_scheduled` lets us range-scan the pending
		// window cheaply.
		const due = await ctx.db
			.query("scheduledNotifications")
			.withIndex("by_sent_scheduled", (q) =>
				q.eq("sent", false).lte("scheduledFor", cutoffHigh),
			)
			.take(BATCH_SIZE);

		// Drop anything older than cutoffLow — its scheduled time is
		// so far in the past that re-sending doesn't make sense.
		const eligible = due.filter((s) => s.scheduledFor >= cutoffLow);

		let processed = 0;
		let failed = 0;

		for (const scheduled of eligible) {
			try {
				await ctx.scheduler.runAfter(
					0,
					internal.notification_dispatch.dispatchScheduled,
					{ scheduledId: scheduled._id },
				);
				processed += 1;
			} catch (err) {
				failed += 1;
				const message =
					err instanceof ConvexError
						? err.message
						: err instanceof Error
							? err.message
							: "unknown error";
				console.error(
					`[cron] failed to enqueue dispatch for ${scheduled._id}: ${message}`,
				);
				await bumpRetryOrAbandon(ctx, scheduled, message);
			}
		}

		if (processed > 0 || failed > 0) {
			console.log(
				`[cron] processPendingNotifications enqueued=${processed} failed=${failed} of ${due.length} due`,
			);
		}

		return { processed, failed, dueCount: due.length };
	},
});

/**
 * Internal helper used by notification_dispatch action after a send
 * attempt. Mark sent, write log entry, or schedule the next retry
 * per source's exponential-backoff rule.
 */
export const recordDispatchResult = internalMutation({
	args: {
		scheduledId: v.id("scheduledNotifications"),
		success: v.boolean(),
		errorMessage: v.optional(v.string()),
		channel: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const scheduled = await ctx.db.get(args.scheduledId);
		if (!scheduled || scheduled.sent) return;

		const now = Date.now();
		const status = args.success ? "sent" : "failed";

		const logId = await ctx.db.insert("notificationLogs", {
			organizationId: scheduled.organizationId,
			bookingId: scheduled.bookingId,
			templateId: scheduled.templateId,
			templateName: "",
			channel: args.channel ?? "email",
			recipient: args.errorMessage ?? "",
			status,
			errorMessage: args.errorMessage,
			sentAt: args.success ? now : undefined,
			metadata: {},
			createdAt: now,
		});

		if (args.success) {
			await ctx.db.patch(args.scheduledId, {
				sent: true,
				processedAt: now,
				notificationLogId: logId,
			});
			return;
		}

		// Failure — retry with exponential backoff, or abandon.
		await bumpRetryOrAbandon(ctx, scheduled, args.errorMessage, logId);
	},
});

async function bumpRetryOrAbandon(
	ctx: MutationCtx,
	scheduled: Pick<Doc<"scheduledNotifications">, "_id" | "retryCount" | "maxRetries" | "notificationLogId">,
	errorMessage?: string,
	logId?: Doc<"notificationLogs">["_id"],
) {
	if (scheduled.retryCount < scheduled.maxRetries) {
		const next = scheduled.retryCount + 1;
		const backoffMin = RETRY_BACKOFF_BASE_MINUTES * (next + 1);
		await ctx.db.patch(scheduled._id, {
			retryCount: next,
			scheduledFor: Date.now() + backoffMin * 60_000,
			notificationLogId: logId ?? scheduled.notificationLogId,
		});
	} else {
		// Max retries hit — mark sent (to stop the cron from re-picking
		// it) but record the failure on the log row.
		await ctx.db.patch(scheduled._id, {
			sent: true,
			processedAt: Date.now(),
			notificationLogId: logId ?? scheduled.notificationLogId,
		});
		console.warn(
			`[cron] abandoned scheduled ${scheduled._id} after ${scheduled.retryCount} retries: ${errorMessage ?? "unknown"}`,
		);
	}
}

export const cleanupOldAssignments = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoffMs =
			Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
		const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

		// Two passes — one per terminal status. The (status, date)
		// index sorts by status first, so each query is bounded.
		const completed = await ctx.db
			.query("assignments")
			.withIndex("by_status_date", (q) =>
				q.eq("status", "completed").lt("date", cutoffDate),
			)
			.collect();
		const cancelled = await ctx.db
			.query("assignments")
			.withIndex("by_status_date", (q) =>
				q.eq("status", "cancelled").lt("date", cutoffDate),
			)
			.collect();

		const targets = [...completed, ...cancelled].filter(
			(a) => a.deletedAt === undefined,
		);

		const now = Date.now();
		for (const a of targets) {
			await ctx.db.patch(a._id, {
				deletedAt: now,
				updatedAt: now,
			});
		}

		console.log(
			`[cron] cleanupOldAssignments archived ${targets.length} assignments older than ${cutoffDate}`,
		);

		return { archived: targets.length, cutoffDate };
	},
});

export const cleanupOldNotifications = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff =
			Date.now() - NOTIFICATION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

		// `by_created_at` index lets us range-scan the whole table by
		// time without touching rows we don't care about.
		const oldLogs = await ctx.db
			.query("notificationLogs")
			.withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
			.collect();

		const oldScheduled = await ctx.db
			.query("scheduledNotifications")
			.withIndex("by_sent_scheduled", (q) =>
				q.eq("sent", true).lt("scheduledFor", cutoff),
			)
			.collect();

		for (const log of oldLogs) {
			await ctx.db.delete(log._id);
		}
		for (const s of oldScheduled) {
			await ctx.db.delete(s._id);
		}

		console.log(
			`[cron] cleanupOldNotifications deleted ${oldLogs.length} logs, ${oldScheduled.length} scheduled (cutoff=${new Date(cutoff).toISOString()})`,
		);

		return {
			logsDeleted: oldLogs.length,
			scheduledDeleted: oldScheduled.length,
			cutoff,
		};
	},
});
