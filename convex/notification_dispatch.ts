// Notification dispatch — sends email/SMS for a ScheduledNotification.
//
// Phase 5: stub implementation. Reads the template + booking + customer,
// renders a basic text + HTML body, logs what would have been sent, then
// records the outcome (including the rendered payload) via
// internal.notifications.recordDispatchResult so a notificationLog
// row exists for audit regardless of phase.
//
// Phase 7 will swap the console.log for an Amazon SES email + (optional)
// SNS SMS via @aws-sdk/client-sesv2 / @aws-sdk/client-sns.
//
// Source: backend/notifications/service.py::NotificationService.
// We preserve the same template_type dispatch shape:
//   - reminder_24h, reminder_2h, post_tour_review
//   - any other type falls back to a generic message (matches source)

"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export type DispatchChannel = "email" | "sms" | "none";

export type DispatchResult = {
	channel: DispatchChannel;
	status: "sent" | "failed" | "skipped";
	error?: string;
	// Rendered payload — captured for the log row. Phase 7 hands these
	// to SES/SNS instead of the console.log.
	rendered: {
		to: string;
		subject: string;
		bodyText: string;
		bodyHtml: string;
	};
};

export const dispatchScheduled = internalAction({
	args: {
		scheduledId: v.id("scheduledNotifications"),
	},
	handler: async (ctx, args): Promise<DispatchResult> => {
		const scheduled = await ctx.runQuery(
			internal.notifications.getScheduledForDispatch,
			{ scheduledId: args.scheduledId },
		);
		if (!scheduled) {
			return {
				channel: "none",
				status: "skipped",
				error: "scheduled notification not found",
				rendered: { to: "", subject: "", bodyText: "", bodyHtml: "" },
			};
		}

		const { template, booking, customer } = scheduled;

		const bodyText = renderPlainText(template.templateType, {
			customerName: customer.name,
			tourName: booking.tourName,
			date: booking.date,
			startTime: booking.startTime,
		});
		const subject = humanSubject(template.templateType);
		const bodyHtml = `<p>${escapeHtml(bodyText)}</p>`;

		// Pick the destination — email if available, phone if not.
		const channel: DispatchChannel = customer.email
			? "email"
			: customer.phone
				? "sms"
				: "none";
		const to = customer.email || customer.phone || "";

		// Phase 5 stub: log the payload that Phase 7 will hand to SES.
		if (channel !== "none") {
			console.log(
				`[dispatch-stub] ${template.templateType} → ${to} (${channel}) subject="${subject}"`,
			);
		} else {
			console.warn(
				`[dispatch-stub] ${template.templateType} has no email or phone for customer ${customer.name}`,
			);
		}

		// Stub always succeeds (no transport in Phase 5). Phase 7
		// returns "failed" on SES/SNS errors and propagates the error
		// message; "skipped" if neither email nor phone is present.
		const status: DispatchResult["status"] =
			channel === "none" ? "skipped" : "sent";
		const result: DispatchResult = {
			channel,
			status,
			rendered: { to, subject, bodyText, bodyHtml },
		};

		// Record the outcome. Mark `sent=true` for both `sent` and
		// `skipped` — the cron shouldn't re-pick either. Only `failed`
		// (real transport error) leaves sent=false so the retry path
		// kicks in via bumpRetryOrAbandon.
		const markSent = result.status === "sent" || result.status === "skipped";
		await ctx.runMutation(
			internal.notifications.recordDispatchResult,
			{
				scheduledId: args.scheduledId,
				success: markSent,
				errorMessage: result.error,
				// Pass through the literal channel — including "none"
				// — so the log row reflects the actual reason for a skip.
				channel: result.channel,
				recipient: to,
				subject,
				templateName: template.name,
			},
		);

		return result;
	},
});

function renderPlainText(
	templateType: string,
	vars: {
		customerName: string;
		tourName: string;
		date: string;
		startTime: string;
	},
): string {
	switch (templateType) {
		case "reminder_24h":
			return `Hi ${vars.customerName}, this is a friendly reminder of your ${vars.tourName} tour on ${vars.date} at ${vars.startTime}.`;
		case "reminder_2h":
			return `Hi ${vars.customerName}, your ${vars.tourName} tour starts in 2 hours (${vars.date} ${vars.startTime}). See you soon!`;
		case "post_tour_review":
			return `Hi ${vars.customerName}, thanks for joining our ${vars.tourName} tour on ${vars.date}. We'd love a quick review.`;
		default:
			return `Hi ${vars.customerName}, you have an update about your tour on ${vars.date}.`;
	}
}

function humanSubject(templateType: string): string {
	switch (templateType) {
		case "reminder_24h":
			return "Your tour is tomorrow";
		case "reminder_2h":
			return "Your tour starts in 2 hours";
		case "post_tour_review":
			return "How was your tour?";
		default:
			return "Tour update";
	}
}

function escapeHtml(s: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	};
	return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
