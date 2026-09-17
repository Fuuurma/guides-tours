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
	query,
	type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { logAudit } from "./lib/audit";
import { requireMembership } from "./lib/authz";
import { logger } from "./lib/logger";

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

		// Customer and tour are both independent lookups against the
		// booking — fetch in parallel.
		const [customer, tour] = await Promise.all([
			ctx.db.get(booking.customerId),
			ctx.db.get(booking.tourId),
		]);
		if (!customer) return null;
		const tourName = tour?.name ?? "your tour";

		return {
			scheduled: { _id: scheduled._id, organizationId: scheduled.organizationId },
			template: {
				name: template.name,
				templateType: template.templateType,
				channel: template.channel,
				isActive: template.isActive,
				emailSubject: template.emailSubject,
				emailBodyText: template.emailBodyText,
				emailBodyHtml: template.emailBodyHtml,
				smsBody: template.smsBody,
			},
			booking: {
				_id: booking._id,
				date: booking.date,
				startTime: booking.startTime,
				tourName,
			},
			customer: {
				name: customer.name,
				email: customer.email,
				phone: customer.phone,
				emailConsent: customer.emailConsent,
				smsConsent: customer.smsConsent,
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
		// RETIRE the stale rows, not just skip them — they stay
		// sent=false at the head of by_sent_scheduled forever, and ≥100
		// of them starve every cron tick (F47). Deleting is the
		// retirement path: these are dispatch intents that can never
		// fire, and cleanupOldNotifications' sent:false sweep is the
		// daily backstop for whatever a single tick misses.
		const stale = due.filter((s) => s.scheduledFor < cutoffLow);
		await Promise.all(stale.map((s) => ctx.db.delete(s._id)));

		let processed = 0;
		let failed = 0;

		// Run the scheduler enqueues in parallel — they're independent
		// (each dispatches to a different scheduled notification) and
		// ctx.scheduler.runAfter is async. Sequential was adding latency
		// proportional to the batch size on every cron tick.
		const enqueueResults = await Promise.allSettled(
			eligible.map((scheduled) =>
				ctx.scheduler
					.runAfter(
						0,
						internal.notification_dispatch.dispatchScheduled,
						{ scheduledId: scheduled._id },
					)
					.then(
						() => ({ scheduled, ok: true as const }),
						(err: unknown) => ({ scheduled, ok: false as const, err }),
					),
			),
		);

		for (const result of enqueueResults) {
			if (result.status === "rejected") {
				failed += 1;
				logger.error(
					`[cron] failed to enqueue dispatch: ${result.reason}`,
				);
				continue;
			}
			if (result.value.ok) {
				processed += 1;
				continue;
			}
			failed += 1;
			const { scheduled, err } = result.value;
			const message =
				err instanceof ConvexError
					? err.message
					: err instanceof Error
						? err.message
						: "unknown error";
			logger.error(
				`[cron] failed to enqueue dispatch for ${scheduled._id}: ${message}`,
			);
			await bumpRetryOrAbandon(ctx, scheduled, message);
		}

		if (processed > 0 || failed > 0) {
			logger.info(
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
		// Intentional non-delivery (inactive template, no reachable/
		// consented channel): terminal, logged as "skipped" — never
		// "sent" (F48). Infra failures (SES missing) come through as
		// success:false and keep retrying.
		skipped: v.optional(v.boolean()),
		errorMessage: v.optional(v.string()),
		channel: v.optional(v.string()),
		recipient: v.optional(v.string()),
		subject: v.optional(v.string()),
		templateName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const scheduled = await ctx.db.get(args.scheduledId);
		if (!scheduled || scheduled.sent) return;

		const now = Date.now();
		const status = args.skipped
			? "skipped"
			: args.success
				? "sent"
				: "failed";

		const logId = await ctx.db.insert("notificationLogs", {
			organizationId: scheduled.organizationId,
			bookingId: scheduled.bookingId,
			templateId: scheduled.templateId,
			templateName: args.templateName ?? "",
			channel: args.channel ?? "email",
			// recipient is always the customer's email or phone — never
			// the error message. Error info lives in errorMessage.
			recipient: args.recipient ?? "",
			status,
			errorMessage: args.errorMessage,
			sentAt: args.success ? now : undefined,
			metadata: args.subject ? { subject: args.subject } : {},
			createdAt: now,
		});

		if (args.success || args.skipped) {
			// Terminal either way: sent stops the cron; skipped is a
			// deliberate non-delivery — no point retrying a booking the
			// customer can't be reached for or an inactive template.
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
	scheduled: Pick<
		Doc<"scheduledNotifications">,
		| "_id"
		| "organizationId"
		| "bookingId"
		| "templateId"
		| "retryCount"
		| "maxRetries"
		| "notificationLogId"
	>,
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
		// Escalation trail (F24): transient logger.warn is invisible to
		// operators — a durable org-scoped audit row lets the audit view
		// surface systemic delivery failure (e.g. SES down/misconfigured).
		await logAudit(ctx, {
			organizationId: scheduled.organizationId,
			userId: "system",
			action: "notification.abandoned",
			resourceType: "scheduledNotification",
			resourceId: String(scheduled._id),
			oldValues: {},
			newValues: {
				bookingId: scheduled.bookingId ? String(scheduled.bookingId) : undefined,
				templateId: scheduled.templateId ? String(scheduled.templateId) : undefined,
				retryCount: scheduled.retryCount,
				maxRetries: scheduled.maxRetries,
				lastError: errorMessage ?? "unknown",
			},
		});
		logger.warn(
			`[cron] abandoned scheduled ${scheduled._id} after ${scheduled.retryCount} retries: ${errorMessage ?? "unknown"}`,
		);
	}
}

/**
 * Load the booking + customer + active `booking_confirmation`
 * template for immediate dispatch. Returns null if the booking was
 * deleted, the customer was deleted, or no active template exists
 * (the dispatcher logs/skips in all three cases).
 */
export const getBookingForImmediateDispatch = internalQuery({
	args: { bookingId: v.id("bookings") },
	handler: async (ctx, args) => {
		const booking = await ctx.db.get(args.bookingId);
		if (!booking) return null;
		// Customer and tour are independent of each other (both
		// reference the booking) — fetch in parallel.
		// Fetch all active booking_confirmation templates for this
		// org, then prefer isDefault. Previously used .first() which
		// returns the oldest by _creationTime — not necessarily the
		// default. Bound the scan: an org with hundreds of templates
		// of one type is unusual.
		const [customer, tour, templates] = await Promise.all([
			ctx.db.get(booking.customerId),
			ctx.db.get(booking.tourId),
			ctx.db
				.query("notificationTemplates")
				.withIndex("by_org_type", (q) =>
					q
						.eq("organizationId", booking.organizationId)
						.eq("templateType", "booking_confirmation"),
				)
				.filter((q) => q.eq(q.field("isActive"), true))
				.take(100),
		]);
		if (!customer) return null;
		// Prefer isDefault; fall back to first active if none is
		// marked default (backwards compat with orgs that never set one).
		const template = templates.find((t) => t.isDefault) ?? templates[0];
		if (!template) return null;
		const tourName = tour?.name ?? "your tour";
		return {
			template: {
				name: template.name,
				templateType: template.templateType,
				channel: template.channel,
				isActive: template.isActive,
				emailSubject: template.emailSubject,
				emailBodyText: template.emailBodyText,
				emailBodyHtml: template.emailBodyHtml,
				smsBody: template.smsBody,
			},
			booking: {
				_id: booking._id,
				organizationId: booking.organizationId,
				date: booking.date,
				startTime: booking.startTime,
				tourName,
			},
			customer: {
				name: customer.name,
				email: customer.email,
				phone: customer.phone,
				emailConsent: customer.emailConsent,
				smsConsent: customer.smsConsent,
			},
		};
	},
});

/**
 * Record the outcome of an immediate booking-confirmation send.
 * We don't have a `scheduledNotifications` row (immediate sends
 * bypass the scheduler), so we write directly to the audit log
 * with a structured action that operators can filter on.
 */
export const recordImmediateDispatchResult = internalMutation({
	args: {
		organizationId: v.string(),
		bookingId: v.id("bookings"),
		channel: v.string(),
		success: v.boolean(),
		// Deliberate non-delivery — logged as immediate_skipped, not
		// immediate_sent (F48).
		skipped: v.optional(v.boolean()),
		errorMessage: v.optional(v.string()),
		recipient: v.string(),
		subject: v.string(),
		templateName: v.string(),
	},
	handler: async (ctx, args) => {
		await logAudit(ctx, {
			organizationId: args.organizationId,
			userId: "system",
			action: args.skipped
				? "notification.immediate_skipped"
				: args.success
					? "notification.immediate_sent"
					: "notification.immediate_failed",
			resourceType: "booking",
			resourceId: args.bookingId,
			oldValues: {},
			// PII: don't log recipient (email/phone) or subject (may contain customer name).
			newValues: {
				channel: args.channel,
				templateName: args.templateName,
				error: args.errorMessage ?? "",
			},
		});
	},
});

export const cleanupOldAssignments = internalMutation({
	args: {
		status: v.optional(
			v.union(v.literal("completed"), v.literal("cancelled")),
		),
		cursor: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const cutoffMs =
			Date.now() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
		const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

		// One status per invocation, paginated with self-continuation:
		// archiving sets only deletedAt, so already-archived rows stay
		// at the head of by_status_date — the old take(5000)+JS-filter
		// scanned the same archived prefix every run and progressed 0
		// new rows once 5000 accumulated (F49). Walking pages lets each
		// run reach the unarchived tail; the archived prefix is re-read
		// daily but never blocks progress again.
		const status = args.status ?? "completed";
		const PAGE = 2000;
		const result = await ctx.db
			.query("assignments")
			.withIndex("by_status_date", (q) =>
				q.eq("status", status).lt("date", cutoffDate),
			)
			.paginate({ numItems: PAGE, cursor: args.cursor ?? null });

		const targets = result.page.filter((a) => a.deletedAt === undefined);

		const now = Date.now();
		await Promise.all(
			targets.map((a) =>
				ctx.db.patch(a._id, {
					deletedAt: now,
					updatedAt: now,
				}),
			),
		);

		logger.info(
			`[cron] cleanupOldAssignments archived ${targets.length} ${status} assignments older than ${cutoffDate}`,
		);

		if (targets.length > 0) {
			await logAudit(ctx, {
				organizationId: "system",
				userId: "system",
				action: "assignments.bulk_archived",
				resourceType: "assignment",
				resourceId: targets[0]?._id ?? "",
				oldValues: {},
				newValues: { count: targets.length, status, cutoffDate },
			});
		}

		if (!result.isDone) {
			await ctx.scheduler.runAfter(
				0,
				internal.notifications.cleanupOldAssignments,
				{ status, cursor: result.continueCursor },
			);
		} else if (status === "completed") {
			// Chain into the cancelled pass after completed drains.
			await ctx.scheduler.runAfter(
				0,
				internal.notifications.cleanupOldAssignments,
				{ status: "cancelled" },
			);
		}

		return {
			archived: targets.length,
			status,
			done: result.isDone,
			continueCursor: result.continueCursor,
			cutoffDate,
		};
	},
});

export const cleanupOldNotifications = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff =
			Date.now() - NOTIFICATION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

		// Fetch old logs and scheduled notifications in parallel —
		// they're independent ranges on different tables. Bound the
		// scan to prevent OOM on orgs with millions of old artifacts.
		const MAX_CLEANUP = 5000;
		const [oldLogs, oldScheduled, deadScheduled] = await Promise.all([
			ctx.db
				.query("notificationLogs")
				.withIndex("by_created_at", (q) => q.lt("createdAt", cutoff))
				.take(MAX_CLEANUP),
			ctx.db
				.query("scheduledNotifications")
				.withIndex("by_sent_scheduled", (q) =>
					q.eq("sent", true).lt("scheduledFor", cutoff),
				)
				.take(MAX_CLEANUP),
			// sent:false rows far past their scheduledFor are dead
			// dispatch intents — the process tick retires them, and this
			// sweep is the daily backstop so a large backlog can't
			// permanently occupy the pending window head (F47).
			ctx.db
				.query("scheduledNotifications")
				.withIndex("by_sent_scheduled", (q) =>
					q.eq("sent", false).lt("scheduledFor", cutoff),
				)
				.take(MAX_CLEANUP),
		]);

		// Deletes on different tables are independent — parallelize.
		await Promise.all([
			...oldLogs.map((log) => ctx.db.delete(log._id)),
			...oldScheduled.map((s) => ctx.db.delete(s._id)),
			...deadScheduled.map((s) => ctx.db.delete(s._id)),
		]);

		logger.info(
			`[cron] cleanupOldNotifications deleted ${oldLogs.length} logs, ${oldScheduled.length} sent scheduled, ${deadScheduled.length} dead pending (cutoff=${new Date(cutoff).toISOString()})`,
		);

		if (oldLogs.length > 0 || oldScheduled.length > 0 || deadScheduled.length > 0) {
			await logAudit(ctx, {
				organizationId: "system",
				userId: "system",
				action: "notifications.bulk_cleaned",
				resourceType: "notificationLog",
				resourceId: oldLogs[0]?._id ?? oldScheduled[0]?._id ?? deadScheduled[0]?._id ?? "",
				oldValues: {},
				newValues: {
					logsDeleted: oldLogs.length,
					scheduledDeleted: oldScheduled.length,
					deadPendingDeleted: deadScheduled.length,
				},
			});
		}

		return {
			logsDeleted: oldLogs.length,
			scheduledDeleted: oldScheduled.length,
			deadPendingDeleted: deadScheduled.length,
			cutoff,
		};
	},
});

/** Recent delivery attempts for the active org (email/SMS). */
export const listRecentLogs = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const member = await requireMembership(ctx);
		const limit = Math.min(Math.max(args.limit ?? 40, 1), 100);
		const rows = await ctx.db
			.query("notificationLogs")
			.withIndex("by_org_created", (q) =>
				q.eq("organizationId", member.organizationId),
			)
			.order("desc")
			.take(limit);
		return rows
			.map((r) => ({
				_id: r._id,
				channel: r.channel,
				recipient: r.recipient,
				status: r.status,
				templateName: r.templateName,
				errorMessage: r.errorMessage,
				bookingId: r.bookingId,
				sentAt: r.sentAt,
				createdAt: r.createdAt,
			}));
	},
});
