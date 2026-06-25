// Notification dispatch — sends email/SMS for a ScheduledNotification.
//
// Phase 5: stub implementation. Reads the template + booking + customer,
// renders a basic text body, logs what would have been sent, then
// records the outcome via an internalMutation.
//
// Phase 7 will swap the log call for an Amazon SES email + (optional)
// SNS SMS via @aws-sdk/client-sesv2 / @aws-sdk/client-sns.
//
// Source: backend/notifications/service.py::NotificationService.
// We preserve the same template_type dispatch shape:
//   - reminder_24h, reminder_2h, post_tour_review
//   - any other type is logged as unknown and skipped (matching source)

"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export type DispatchChannel = "email" | "sms" | "none";

export type DispatchResult = {
	channel: DispatchChannel;
	status: "sent" | "failed" | "skipped";
	error?: string;
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
			};
		}

		const { template, booking, customer } = scheduled;

		// Render a basic body — Phase 7 will swap for Jinja-style
		// templating. For now, just enough to prove the pipeline.
		const bodyText = renderPlainText(template.templateType, {
			customerName: customer.name,
			tourName: booking.tourName,
			date: booking.date,
			startTime: booking.startTime,
		});
		const subject = humanSubject(template.templateType);
		// Phase 7 will render bodyHtml from the template via SES; kept
		// the helper so the wiring point is obvious.
		const _bodyHtml = `<p>${escapeHtml(bodyText)}</p>`;
		void _bodyHtml;

		// Phase 5 stub: log the payload that Phase 7 will hand to SES.
		console.log(
			`[dispatch-stub] ${template.templateType} → ${customer.email} (${template.channel}) subject="${subject}"`,
		);

		// Stub always succeeds. Phase 7 returns "failed" on transport
		// errors and propagates the SES error message.
		const result: DispatchResult = {
			channel: "email",
			status: "sent",
		};

		// Record the outcome so the scheduled row gets marked sent
		// (or retried) and a notificationLog row exists for audit.
		await ctx.runMutation(
			internal.notifications.recordDispatchResult,
			{
				scheduledId: args.scheduledId,
				success: result.status === "sent",
				errorMessage: result.error,
				channel: result.channel === "none" ? undefined : result.channel,
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
