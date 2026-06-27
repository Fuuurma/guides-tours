// Notification dispatch — sends email/SMS for a ScheduledNotification.
//
// Source: backend/notifications/service.py::NotificationService.
//
// Email dispatch via fetch + Signature V4 signing (see convex/lib/awsSigV4.ts). Works in
// the Convex default runtime + Cloudflare Workers without node-specific
// imports. SMS is still a stub (would use @aws-sdk/client-sns in
// production).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { signSesRequest, buildSesSendEmailXml } from "./lib/awsSigV4";

export type DispatchChannel = "email" | "sms" | "none";

export type DispatchResult = {
	channel: DispatchChannel;
	status: "sent" | "failed" | "skipped";
	error?: string;
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

		const channel: DispatchChannel = customer.email
			? "email"
			: customer.phone
				? "sms"
				: "none";
		const to = customer.email || customer.phone || "";

		let result: DispatchResult;
		if (channel === "email") {
			result = await sendEmail({
				to,
				subject,
				bodyText,
				bodyHtml,
			});
		} else if (channel === "sms") {
			// SMS remains a stub (would use SNS Publish).
			console.warn(
				`[dispatch-stub-sms] ${template.templateType} → ${to} subject="${subject}"`,
			);
			result = {
				channel: "sms",
				status: "sent",
				rendered: { to, subject, bodyText, bodyHtml },
			};
		} else {
			console.warn(
				`[dispatch] ${template.templateType} has no email or phone for customer ${customer.name}`,
			);
			result = {
				channel: "none",
				status: "skipped",
				error: "no email or phone on file",
				rendered: { to, subject, bodyText, bodyHtml },
			};
		}

		// Record the outcome.
		const markSent = result.status === "sent" || result.status === "skipped";
		await ctx.runMutation(
			internal.notifications.recordDispatchResult,
			{
				scheduledId: args.scheduledId,
				success: markSent,
				errorMessage: result.error,
				channel: result.channel,
				recipient: to,
				subject,
				templateName: template.name,
			},
		);

		return result;
	},
});

/**
 * Send an immediate booking-confirmation email (or SMS stub) for
 * a booking. Looks up the org's active `booking_confirmation`
 * template + customer contact info + tour name, then dispatches
 * via the same SES path as scheduled reminders.
 *
 * Called from bookings.create and public_booking.internalCreate
 * so the customer always gets a confirmation — not just 24h/2h
 * reminders. Returns DispatchResult for observability; never
 * throws (failure to send email doesn't fail the booking create).
 */
export const dispatchImmediateBookingConfirmation = internalAction({
	args: {
		bookingId: v.id("bookings"),
	},
	handler: async (ctx, args): Promise<DispatchResult> => {
		const ctx_ = await ctx.runQuery(
			internal.notifications.getBookingForImmediateDispatch,
			{ bookingId: args.bookingId },
		);
		if (!ctx_) {
			return {
				channel: "none",
				status: "skipped",
				error: "booking/customer/template not found",
				rendered: { to: "", subject: "", bodyText: "", bodyHtml: "" },
			};
		}
		const { template, booking, customer } = ctx_;

		// Skip if template is inactive.
		if (!template.isActive) {
			return {
				channel: "none",
				status: "skipped",
				error: "booking_confirmation template is inactive",
				rendered: { to: "", subject: "", bodyText: "", bodyHtml: "" },
			};
		}

		const bodyText = renderPlainText(template.templateType, {
			customerName: customer.name,
			tourName: booking.tourName,
			date: booking.date,
			startTime: booking.startTime,
		});
		const subject = humanSubject(template.templateType);
		const bodyHtml = `<p>${escapeHtml(bodyText)}</p>`;

		const channel: DispatchChannel = customer.email
			? "email"
			: customer.phone
				? "sms"
				: "none";
		const to = customer.email || customer.phone || "";

		let result: DispatchResult;
		if (channel === "email") {
			result = await sendEmail({ to, subject, bodyText, bodyHtml });
		} else if (channel === "sms") {
			console.warn(
				`[dispatch-stub-sms-immediate] ${template.templateType} → ${to} subject="${subject}"`,
			);
			result = {
				channel: "sms",
				status: "sent",
				rendered: { to, subject, bodyText, bodyHtml },
			};
		} else {
			result = {
				channel: "none",
				status: "skipped",
				error: "no email or phone on file",
				rendered: { to, subject, bodyText, bodyHtml },
			};
		}

		// Best-effort audit log so operators can see confirmation
		// delivery state in the audit log. We don't write to a
		// dedicated table because immediate sends don't have a
		// scheduledFor row.
		await ctx.runMutation(
			internal.notifications.recordImmediateDispatchResult,
			{
				organizationId: booking.organizationId,
				bookingId: args.bookingId,
				channel: result.channel,
				success: result.status === "sent" || result.status === "skipped",
				errorMessage: result.error,
				recipient: to,
				subject,
				templateName: template.name,
			},
		);

		return result;
	},
});

async function sendEmail(params: {
	to: string;
	subject: string;
	bodyText: string;
	bodyHtml: string;
}): Promise<DispatchResult> {
	const region = process.env.AWS_REGION;
	const accessKey = process.env.AWS_ACCESS_KEY_ID;
	const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
	const from = process.env.SES_FROM_ADDRESS;

	if (!region || !accessKey || !secretKey || !from) {
		console.warn(
			"[dispatch] SES not configured (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / SES_FROM_ADDRESS) — skipping email send",
		);
		return {
			channel: "email",
			status: "skipped",
			rendered: {
				to: params.to,
				subject: params.subject,
				bodyText: params.bodyText,
				bodyHtml: params.bodyHtml,
			},
		};
	}

	const xmlBody = buildSesSendEmailXml({
		from,
		to: params.to,
		subject: params.subject,
		bodyText: params.bodyText,
		bodyHtml: params.bodyHtml,
	});

	const signed = await signSesRequest({
		region,
		accessKey,
		secretKey,
		body: xmlBody,
	});

	let resp: Response;
	try {
		resp = await fetch(signed.url, {
			method: signed.method,
			headers: signed.headers,
			body: signed.body,
		});
	} catch (e) {
		return {
			channel: "email",
			status: "failed",
			error: `fetch error: ${(e as Error).message}`,
			rendered: {
				to: params.to,
				subject: params.subject,
				bodyText: params.bodyText,
				bodyHtml: params.bodyHtml,
			},
		};
	}

	if (!resp.ok) {
		const errText = await resp.text();
		return {
			channel: "email",
			status: "failed",
			error: `SES ${resp.status}: ${errText.slice(0, 500)}`,
			rendered: {
				to: params.to,
				subject: params.subject,
				bodyText: params.bodyText,
				bodyHtml: params.bodyHtml,
			},
		};
	}

	return {
		channel: "email",
		status: "sent",
		rendered: {
			to: params.to,
			subject: params.subject,
			bodyText: params.bodyText,
			bodyHtml: params.bodyHtml,
		},
	};
}

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
		case "booking_confirmation":
			return `Hi ${vars.customerName}, your booking for ${vars.tourName} on ${vars.date} at ${vars.startTime} is confirmed. We look forward to seeing you!`;
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
		case "booking_confirmation":
			return "Booking confirmed";
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
