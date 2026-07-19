// Notification dispatch — sends email/SMS for a ScheduledNotification.
//
// Email via SES (convex/lib/sendEmail.ts). SMS via Twilio
// (convex/notification_sms.ts). Template rendering lives in
// convex/lib/notificationRender.ts so email + SMS share one dialect.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sendTemplatedEmail } from "./lib/sendEmail";
import {
	fallbackSubject,
	renderNotification,
} from "./lib/notificationRender";
import { sendTwilioSms } from "./notification_sms";

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

type DispatchContext = {
	organizationId: string;
	template: {
		templateType: string;
		name: string;
		isActive?: boolean;
		emailSubject?: string;
		emailBodyText?: string;
		emailBodyHtml?: string;
		smsBody?: string;
	};
	booking: {
		_id?: string;
		tourName: string;
		date: string;
		startTime: string;
	};
	customer: {
		name: string;
		email?: string;
		phone?: string;
		emailConsent?: boolean;
		smsConsent?: boolean;
	};
};

type ActionLike = {
	runQuery: (...args: never[]) => Promise<unknown>;
	runMutation: (...args: never[]) => Promise<unknown>;
};

async function renderAndDispatch(
	actionCtx: ActionLike,
	ctx: DispatchContext,
	tag: "scheduled" | "immediate",
): Promise<DispatchResult> {
	const { template, booking, customer } = ctx;

	if (template.isActive === false) {
		return {
			channel: "none",
			status: "skipped",
			error: "template is inactive",
			rendered: { to: "", subject: "", bodyText: "", bodyHtml: "" },
		};
	}

	const rendered = renderNotification(template, {
		customerName: customer.name,
		tourName: booking.tourName,
		date: booking.date,
		startTime: booking.startTime,
	});

	const canEmail = !!customer.email && customer.emailConsent !== false;
	const canSms = !!customer.phone && customer.smsConsent === true;
	const channel: DispatchChannel = canEmail
		? "email"
		: canSms
			? "sms"
			: "none";
	const to = customer.email || customer.phone || "";

	let result: DispatchResult;
	if (channel === "email" && customer.email) {
		result = await sendEmail({
			to: customer.email,
			subject: rendered.subject,
			bodyText: rendered.bodyText,
			bodyHtml: rendered.bodyHtml,
		});
	} else if (channel === "sms" && customer.phone) {
		const sms = await sendTwilioSms(actionCtx as never, {
			organizationId: ctx.organizationId,
			to: customer.phone,
			body: rendered.smsBody,
			recipientName: customer.name,
			bookingId: booking._id,
		});
		if (sms.ok) {
			result = {
				channel: "sms",
				status: "sent",
				rendered: {
					to: customer.phone,
					subject: rendered.subject,
					bodyText: rendered.smsBody,
					bodyHtml: rendered.bodyHtml,
				},
			};
		} else {
			console.warn(
				`[dispatch-sms-${tag}] ${template.templateType} → ${customer.phone} failed: ${sms.error}`,
			);
			result = {
				channel: "sms",
				status: "failed",
				error: sms.error,
				rendered: {
					to: customer.phone,
					subject: rendered.subject,
					bodyText: rendered.smsBody,
					bodyHtml: rendered.bodyHtml,
				},
			};
		}
	} else {
		const noContact = !customer.email && !customer.phone;
		const reason = noContact
			? "no email or phone on file"
			: "customer has not consented to email or SMS";
		console.warn(
			`[dispatch] ${template.templateType} skipped for ${customer.name}: ${reason}`,
		);
		result = {
			channel: "none",
			status: "skipped",
			error: reason,
			rendered: {
				to,
				subject: rendered.subject,
				bodyText: rendered.bodyText,
				bodyHtml: rendered.bodyHtml,
			},
		};
	}

	return result;
}

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

		const result = await renderAndDispatch(
			ctx as never,
			{
				organizationId: scheduled.scheduled.organizationId,
				template: {
					...scheduled.template,
					isActive: scheduled.template.isActive ?? true,
				},
				booking: {
					_id: scheduled.booking._id,
					tourName: scheduled.booking.tourName,
					date: scheduled.booking.date,
					startTime: scheduled.booking.startTime,
				},
				customer: scheduled.customer,
			},
			"scheduled",
		);
		const to = scheduled.customer.email || scheduled.customer.phone || "";
		const subject =
			result.rendered.subject ||
			fallbackSubject(scheduled.template.templateType);

		const markSent = result.status === "sent" || result.status === "skipped";
		await ctx.runMutation(internal.notifications.recordDispatchResult, {
			scheduledId: args.scheduledId,
			success: markSent,
			errorMessage: result.error,
			channel: result.channel,
			recipient: to,
			subject,
			templateName: scheduled.template.name,
		});

		return result;
	},
});

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

		const result = await renderAndDispatch(
			ctx as never,
			{
				organizationId: ctx_.booking.organizationId,
				template: ctx_.template,
				booking: {
					_id: ctx_.booking._id,
					tourName: ctx_.booking.tourName,
					date: ctx_.booking.date,
					startTime: ctx_.booking.startTime,
				},
				customer: ctx_.customer,
			},
			"immediate",
		);
		const to = ctx_.customer.email || ctx_.customer.phone || "";
		const subject =
			result.rendered.subject || fallbackSubject(ctx_.template.templateType);

		await ctx.runMutation(
			internal.notifications.recordImmediateDispatchResult,
			{
				organizationId: ctx_.booking.organizationId,
				bookingId: args.bookingId,
				channel: result.channel,
				success: result.status === "sent" || result.status === "skipped",
				errorMessage: result.error,
				recipient: to,
				subject,
				templateName: ctx_.template.name,
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
	const result = await sendTemplatedEmail({
		to: params.to,
		subject: params.subject,
		bodyText: params.bodyText,
		bodyHtml: params.bodyHtml,
	});

	if (result.status === "sent") {
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

	if (result.status === "skipped") {
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

	return {
		channel: "email",
		status: "failed",
		error: result.error,
		rendered: {
			to: params.to,
			subject: params.subject,
			bodyText: params.bodyText,
			bodyHtml: params.bodyHtml,
		},
	};
}
